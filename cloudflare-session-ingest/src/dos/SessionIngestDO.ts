import { DurableObject } from 'cloudflare:workers';
import { eq, ne, gt, and, inArray } from 'drizzle-orm';
import { drizzle, type DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';

import { ingestItems, ingestMeta } from '../db/sqlite-schema';
import type { Env } from '../env';
import type { IngestBatch } from '../types/session-sync';
import type { SessionDataItem } from '../types/session-sync';
import { getItemIdentity } from '../util/compaction';
import {
  extractNormalizedGitBranchFromItem,
  extractNormalizedGitUrlFromItem,
  extractNormalizedOrgIdFromItem,
  extractNormalizedParentIdFromItem,
  extractNormalizedPlatformFromItem,
  extractNormalizedTitleFromItem,
} from './session-ingest-extractors';
import {
  computeSessionMetrics,
  INACTIVITY_TIMEOUT_MS,
  POST_CLOSE_DRAIN_MS,
  type TerminationReason,
} from './session-metrics';
import migrations from '../../drizzle/migrations';

type IngestMetaKey =
  | ExtractableMetaKey
  | 'kiloUserId'
  | 'sessionId'
  | 'ingestVersion'
  | 'closeReason'
  | 'metricsEmitted';

type ExtractableMetaKey = 'title' | 'parentId' | 'platform' | 'orgId' | 'gitUrl' | 'gitBranch';

function writeIngestMetaIfChanged(
  db: DrizzleSqliteDODatabase,
  params: { key: IngestMetaKey; incomingValue: string | null }
): { changed: boolean; value: string | null } {
  const existing = db
    .select({ value: ingestMeta.value })
    .from(ingestMeta)
    .where(eq(ingestMeta.key, params.key))
    .get();
  const currentValue = existing?.value ?? null;

  if (currentValue === params.incomingValue) {
    return { changed: false, value: params.incomingValue };
  }

  db.insert(ingestMeta)
    .values({ key: params.key, value: params.incomingValue })
    .onConflictDoUpdate({ target: ingestMeta.key, set: { value: params.incomingValue } })
    .run();

  return { changed: true, value: params.incomingValue };
}

const INGEST_META_EXTRACTORS: Array<{
  key: ExtractableMetaKey;
  extract: (item: IngestBatch[number]) => string | null | undefined;
}> = [
  { key: 'title', extract: extractNormalizedTitleFromItem },
  { key: 'parentId', extract: extractNormalizedParentIdFromItem },
  { key: 'platform', extract: extractNormalizedPlatformFromItem },
  { key: 'orgId', extract: extractNormalizedOrgIdFromItem },
  { key: 'gitUrl', extract: extractNormalizedGitUrlFromItem },
  { key: 'gitBranch', extract: extractNormalizedGitBranchFromItem },
];

type Changes = Array<{ name: ExtractableMetaKey; value: string | null }>;

export class SessionIngestDO extends DurableObject<Env> {
  private db: DrizzleSqliteDODatabase;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.db = drizzle(state.storage, { logger: false });

    void state.blockConcurrencyWhile(() => {
      return migrate(this.db, migrations);
    });
  }

  async ingest(
    payload: IngestBatch,
    kiloUserId: string,
    sessionId: string,
    ingestVersion = 0,
    ingestedAt?: number,
    r2References?: Record<string, string>
  ): Promise<{
    changes: Changes;
  }> {
    writeIngestMetaIfChanged(this.db, { key: 'kiloUserId', incomingValue: kiloUserId });
    writeIngestMetaIfChanged(this.db, { key: 'sessionId', incomingValue: sessionId });
    writeIngestMetaIfChanged(this.db, {
      key: 'ingestVersion',
      incomingValue: String(ingestVersion),
    });

    const incomingByKey: Record<ExtractableMetaKey, string | null | undefined> = {
      title: undefined,
      parentId: undefined,
      platform: undefined,
      orgId: undefined,
      gitUrl: undefined,
      gitBranch: undefined,
    };

    let hasSessionOpen = false;
    let closeReason: string | undefined;

    for (const item of payload) {
      const { item_id, item_type } = getItemIdentity(item);

      // Check timestamp guard: skip if existing row has a newer ingested_at
      if (ingestedAt !== undefined) {
        const existing = this.db
          .select({ ingested_at: ingestItems.ingested_at })
          .from(ingestItems)
          .where(eq(ingestItems.item_id, item_id))
          .get();
        if (
          existing?.ingested_at !== null &&
          existing?.ingested_at !== undefined &&
          existing.ingested_at > ingestedAt
        ) {
          continue;
        }
      }

      const r2Key = r2References?.[item_id];
      const itemDataJson = r2Key ? '{}' : JSON.stringify(item.data);
      const itemDataR2Key = r2Key ?? null;

      this.db
        .insert(ingestItems)
        .values({
          item_id,
          item_type,
          item_data: itemDataJson,
          item_data_r2_key: itemDataR2Key,
          ingested_at: ingestedAt ?? null,
        })
        .onConflictDoUpdate({
          target: ingestItems.item_id,
          set: {
            item_type,
            item_data: itemDataJson,
            item_data_r2_key: itemDataR2Key,
            ingested_at: ingestedAt ?? null,
          },
        })
        .run();

      for (const extractor of INGEST_META_EXTRACTORS) {
        const maybeValue = extractor.extract(item);
        if (maybeValue !== undefined) {
          incomingByKey[extractor.key] = maybeValue;
        }
      }

      if (item.type === 'session_open') {
        hasSessionOpen = true;
      } else if (item.type === 'session_close') {
        closeReason = item.data.reason;
      }
    }

    const changes: Changes = [];

    for (const key of Object.keys(incomingByKey) as ExtractableMetaKey[]) {
      const incoming = incomingByKey[key];
      if (incoming === undefined) continue;
      const meta = writeIngestMetaIfChanged(this.db, {
        key,
        incomingValue: incoming,
      });
      if (meta.changed) {
        changes.push({ name: key, value: meta.value });
      }
    }

    if (ingestVersion >= 1) {
      // v1 clients send explicit open/close pairs. Only those events drive alarms.
      if (hasSessionOpen) {
        // New turn starting — clear prior emission so metrics are re-computed.
        this.db
          .delete(ingestMeta)
          .where(inArray(ingestMeta.key, ['metricsEmitted', 'closeReason']))
          .run();
        await this.ctx.storage.setAlarm(Date.now() + INACTIVITY_TIMEOUT_MS);
      }
      if (closeReason) {
        writeIngestMetaIfChanged(this.db, { key: 'closeReason', incomingValue: closeReason });
        await this.ctx.storage.setAlarm(Date.now() + POST_CLOSE_DRAIN_MS);
      }
      // Events without open/close (stragglers) don't touch the alarm.
    } else {
      // v0 (legacy): no open/close signals, rely on inactivity timeout.
      await this.ctx.storage.setAlarm(Date.now() + INACTIVITY_TIMEOUT_MS);
    }

    return {
      changes,
    };
  }

  async getAllStream(): Promise<ReadableStream<Uint8Array>> {
    const db = this.db;
    const r2 = this.env.SESSION_INGEST_R2;
    const encoder = new TextEncoder();

    // Phase 1: Scan — collect lightweight refs from SQLite
    type ItemRef = {
      item_id: string;
      item_type: string;
      item_data: string;
      r2Key: string | null;
    };
    const refs: ItemRef[] = [];
    let cursor = 0;
    while (true) {
      const row = db
        .select({
          id: ingestItems.id,
          item_id: ingestItems.item_id,
          item_type: ingestItems.item_type,
          item_data: ingestItems.item_data,
          item_data_r2_key: ingestItems.item_data_r2_key,
        })
        .from(ingestItems)
        .where(and(ne(ingestItems.item_type, 'session_diff'), gt(ingestItems.id, cursor)))
        .orderBy(ingestItems.id)
        .limit(1)
        .get();

      if (!row) break;
      cursor = row.id;
      refs.push({
        item_id: row.item_id,
        item_type: row.item_type,
        item_data: row.item_data,
        r2Key: row.item_data_r2_key,
      });
    }

    // Phase 2: Group — build snapshot structure from refs
    let sessionRef: ItemRef | null = null;
    const messageOrder: string[] = [];
    const messageRefById = new Map<string, ItemRef>();
    const partRefsByMsgId = new Map<string, ItemRef[]>();

    for (const ref of refs) {
      if (ref.item_type === 'session') {
        sessionRef = ref;
      } else if (ref.item_type === 'message') {
        // item_id = 'message/{msgId}'
        const msgId = ref.item_id.slice('message/'.length);
        messageRefById.set(msgId, ref);
        if (!messageOrder.includes(msgId)) {
          messageOrder.push(msgId);
        }
      } else if (ref.item_type === 'part') {
        // item_id = '{msgId}/{partId}'
        const slashIdx = ref.item_id.indexOf('/');
        const msgId = slashIdx >= 0 ? ref.item_id.slice(0, slashIdx) : ref.item_id;
        let parts = partRefsByMsgId.get(msgId);
        if (!parts) {
          parts = [];
          partRefsByMsgId.set(msgId, parts);
        }
        parts.push(ref);
        // Ensure message is in order list even if we see parts before message
        if (!messageRefById.has(msgId) && !messageOrder.includes(msgId)) {
          messageOrder.push(msgId);
        }
      }
    }

    // Phase 3: Stream JSON
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // {"info":
          controller.enqueue(encoder.encode('{"info":'));
          if (sessionRef) {
            await enqueueItemData(controller, sessionRef, r2, encoder);
          } else {
            controller.enqueue(encoder.encode('{}'));
          }

          // ,"messages":[
          controller.enqueue(encoder.encode(',"messages":['));

          let firstMsg = true;
          for (const msgId of messageOrder) {
            const msgRef = messageRefById.get(msgId);
            if (!msgRef) continue;

            if (!firstMsg) controller.enqueue(encoder.encode(','));
            firstMsg = false;

            // {"info":
            controller.enqueue(encoder.encode('{"info":'));
            await enqueueItemData(controller, msgRef, r2, encoder);

            // ,"parts":[
            controller.enqueue(encoder.encode(',"parts":['));
            const parts = partRefsByMsgId.get(msgId) ?? [];
            for (let i = 0; i < parts.length; i++) {
              if (i > 0) controller.enqueue(encoder.encode(','));
              await enqueueItemData(controller, parts[i], r2, encoder);
            }
            controller.enqueue(encoder.encode(']}'));
          }

          // ]}
          controller.enqueue(encoder.encode(']}'));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
  }

  /**
   * Compute and emit session metrics to the o11y worker.
   * Returns true if metrics were emitted, false if already emitted.
   */
  private async emitSessionMetrics(
    kiloUserId: string,
    sessionId: string,
    closeReason: TerminationReason,
    ingestVersion: number
  ): Promise<boolean> {
    const emittedRow = this.db
      .select({ value: ingestMeta.value })
      .from(ingestMeta)
      .where(eq(ingestMeta.key, 'metricsEmitted'))
      .get();
    if (emittedRow?.value === 'true') {
      return false;
    }

    const rows = this.db
      .select({
        item_type: ingestItems.item_type,
        item_data: ingestItems.item_data,
      })
      .from(ingestItems)
      .where(ne(ingestItems.item_type, 'session_diff'))
      .orderBy(ingestItems.id)
      .all();

    if (rows.length === 0) {
      return false;
    }

    const metrics = computeSessionMetrics(rows, closeReason);

    const modelRow = this.db
      .select({ item_data: ingestItems.item_data })
      .from(ingestItems)
      .where(eq(ingestItems.item_id, 'model'))
      .get();
    let model: string | undefined;
    if (modelRow) {
      try {
        const arr = JSON.parse(modelRow.item_data) as Extract<
          SessionDataItem,
          { type: 'model' }
        >['data'];
        if (arr.length > 0) {
          model = arr[arr.length - 1].id;
        }
      } catch {
        // Best-effort: skip model on parse errors.
      }
    }

    await this.env.O11Y.ingestSessionMetrics({
      kiloUserId,
      sessionId,
      ingestVersion,
      model,
      ...metrics,
    });

    // Mark metrics as emitted to prevent duplicates
    this.db
      .insert(ingestMeta)
      .values({ key: 'metricsEmitted', value: 'true' })
      .onConflictDoUpdate({ target: ingestMeta.key, set: { value: 'true' } })
      .run();

    await this.ctx.storage.deleteAlarm();

    return true;
  }

  /**
   * Alarm fires either after POST_CLOSE_DRAIN_MS (session closed) or
   * INACTIVITY_TIMEOUT_MS (no activity). Reads the close reason from
   * ingest_meta if present, otherwise falls back to 'abandoned'.
   */
  async alarm(): Promise<void> {
    const metaRows = this.db
      .select()
      .from(ingestMeta)
      .where(inArray(ingestMeta.key, ['kiloUserId', 'sessionId', 'closeReason', 'ingestVersion']))
      .all();

    const meta = Object.fromEntries(metaRows.map(r => [r.key, r.value]));
    const kiloUserId = meta['kiloUserId'];
    const sessionId = meta['sessionId'];

    if (!kiloUserId || !sessionId) return;

    const closeReason = (meta['closeReason'] ?? 'abandoned') as TerminationReason;
    const ingestVersion = Number(meta['ingestVersion'] ?? '0') || 0;

    // DO alarm exceptions don't populate the Exceptions array in logpush traces,
    // so without this catch we get outcome=exception with zero diagnostics.
    try {
      await this.emitSessionMetrics(kiloUserId, sessionId, closeReason, ingestVersion);
    } catch (error) {
      console.error('SessionIngestDO alarm failed', {
        sessionId,
        kiloUserId,
        closeReason,
        ingestVersion,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw error;
    }
  }

  async clear(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    await migrate(this.db, migrations);
  }
}

async function enqueueItemData(
  controller: ReadableStreamDefaultController<Uint8Array>,
  ref: { item_data: string; r2Key: string | null },
  r2: R2Bucket,
  encoder: TextEncoder
): Promise<void> {
  if (ref.r2Key) {
    const obj = await r2.get(ref.r2Key);
    if (obj) {
      const reader = obj.body.getReader();
      while (true) {
        const result: ReadableStreamReadResult<Uint8Array> = await reader.read();
        if (result.done) break;
        controller.enqueue(result.value);
      }
    } else {
      controller.enqueue(encoder.encode('{}'));
    }
  } else {
    controller.enqueue(encoder.encode(ref.item_data));
  }
}

export function getSessionIngestDO(env: Env, params: { kiloUserId: string; sessionId: string }) {
  const doKey = `${params.kiloUserId}/${params.sessionId}`;
  const id = env.SESSION_INGEST_DO.idFromName(doKey);
  return env.SESSION_INGEST_DO.get(id);
}
