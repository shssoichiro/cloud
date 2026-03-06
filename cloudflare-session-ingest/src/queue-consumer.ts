import { eq, and, sql } from 'drizzle-orm';
import { getWorkerDb } from '@kilocode/db/client';
import { cli_sessions_v2 } from '@kilocode/db/schema';
import { JSONParser } from '@streamparser/json';

import type { Env } from './env';
import { SessionItemSchema } from './types/session-sync';
import { getItemIdentity } from './util/compaction';
import { MAX_INGEST_ITEM_BYTES, MAX_SINGLE_ITEM_BYTES } from './util/ingest-limits';
import { getSessionIngestDO } from './dos/SessionIngestDO';
import { withDORetry } from '@kilocode/worker-utils';

export interface IngestQueueMessage {
  r2Key: string;
  kiloUserId: string;
  sessionId: string;
  ingestVersion: number;
  ingestedAt: number;
}

async function processMessage(env: Env, msg: IngestQueueMessage): Promise<void> {
  const { r2Key, kiloUserId, sessionId, ingestVersion, ingestedAt } = msg;

  const obj = await env.SESSION_INGEST_R2.get(r2Key);
  if (!obj) {
    console.warn('R2 object not found, skipping', { r2Key });
    return;
  }

  const mergedChanges = new Map<string, string | null>();

  // Collect complete items from the streaming parser, then process them sequentially
  const items: Record<string, unknown>[] = [];

  const parser = new JSONParser({ paths: ['$.data.*'], keepStack: false });

  parser.onValue = parsedElementInfo => {
    const { value, stack } = parsedElementInfo;
    // Only capture top-level array elements emitted by $.data.* path
    if (stack.length === 2 && value != null) {
      items.push(value as Record<string, unknown>);
    }
  };

  parser.onError = (err: Error) => {
    console.error('JSON parse error in queue consumer', {
      r2Key,
      error: err.message,
    });
  };

  // Feed the R2 body into the parser
  const reader = obj.body.getReader();
  let readDone = false;
  while (!readDone) {
    const result: ReadableStreamReadResult<Uint8Array> = await reader.read();
    if (result.done) {
      parser.end();
      readDone = true;
    } else {
      parser.write(result.value);
    }
  }

  // Process collected items sequentially
  for (const rawItem of items) {
    try {
      await processItem(
        env,
        rawItem,
        r2Key,
        kiloUserId,
        sessionId,
        ingestVersion,
        ingestedAt,
        mergedChanges
      );
    } catch (err) {
      console.error('Error processing single item in queue consumer, continuing', {
        r2Key,
        type: rawItem['type'],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Update Postgres with metadata changes
  await applyMetadataChanges(env, kiloUserId, sessionId, mergedChanges);

  // Delete staging R2 object on success
  await env.SESSION_INGEST_R2.delete(r2Key);
}

async function processItem(
  env: Env,
  rawItem: Record<string, unknown>,
  r2Key: string,
  kiloUserId: string,
  sessionId: string,
  ingestVersion: number,
  ingestedAt: number,
  mergedChanges: Map<string, string | null>
): Promise<void> {
  // Check serialized size
  const itemJson = JSON.stringify(rawItem);
  if (itemJson.length > MAX_SINGLE_ITEM_BYTES) {
    console.warn('Skipping oversized item in queue consumer', {
      r2Key,
      sizeBytes: itemJson.length,
      maxBytes: MAX_SINGLE_ITEM_BYTES,
      type: rawItem['type'],
    });
    return;
  }

  // Validate against schema
  const parsed = SessionItemSchema.safeParse(rawItem);
  if (!parsed.success) {
    console.warn('Skipping invalid item in queue consumer', {
      r2Key,
      type: rawItem['type'],
      errors: parsed.error.issues.map(i => i.message),
    });
    return;
  }

  const item = parsed.data;
  const { item_id } = getItemIdentity(item);

  // Check if item data exceeds DO SQLite row limit
  const itemDataJson = JSON.stringify(item.data);
  let r2References: Record<string, string> | undefined;
  if (itemDataJson.length > MAX_INGEST_ITEM_BYTES) {
    const itemR2Key = `items/${kiloUserId}/${sessionId}/${item_id}`;
    await env.SESSION_INGEST_R2.put(itemR2Key, itemDataJson);
    r2References = { [item_id]: itemR2Key };
  }

  const ingestResult = await withDORetry(
    () => getSessionIngestDO(env, { kiloUserId, sessionId }),
    stub => stub.ingest([item], kiloUserId, sessionId, ingestVersion, ingestedAt, r2References),
    'SessionIngestDO.ingest'
  );

  for (const change of ingestResult.changes) {
    mergedChanges.set(change.name, change.value);
  }
}

async function applyMetadataChanges(
  env: Env,
  kiloUserId: string,
  sessionId: string,
  mergedChanges: Map<string, string | null>
): Promise<void> {
  if (mergedChanges.size === 0) return;

  const db = getWorkerDb(env.HYPERDRIVE.connectionString);

  const title = mergedChanges.has('title') ? (mergedChanges.get('title') ?? null) : undefined;
  const platform = mergedChanges.has('platform')
    ? (mergedChanges.get('platform') ?? null)
    : undefined;
  const orgId = mergedChanges.has('orgId') ? (mergedChanges.get('orgId') ?? null) : undefined;
  const gitUrl = mergedChanges.has('gitUrl') ? (mergedChanges.get('gitUrl') ?? null) : undefined;
  const gitBranch = mergedChanges.has('gitBranch')
    ? (mergedChanges.get('gitBranch') ?? null)
    : undefined;

  const updates: Partial<
    Pick<
      typeof cli_sessions_v2.$inferInsert,
      'title' | 'created_on_platform' | 'organization_id' | 'git_url' | 'git_branch'
    >
  > = {};
  if (title !== undefined) updates.title = title;
  if (platform !== undefined && platform !== null) updates.created_on_platform = platform;
  if (orgId !== undefined) updates.organization_id = orgId;
  if (gitUrl !== undefined) updates.git_url = gitUrl;
  if (gitBranch !== undefined) updates.git_branch = gitBranch;

  if (Object.keys(updates).length > 0) {
    await db
      .update(cli_sessions_v2)
      .set(updates)
      .where(
        and(eq(cli_sessions_v2.session_id, sessionId), eq(cli_sessions_v2.kilo_user_id, kiloUserId))
      );
  }

  const parentSessionId = mergedChanges.has('parentId')
    ? (mergedChanges.get('parentId') ?? null)
    : undefined;
  if (parentSessionId !== undefined) {
    if (parentSessionId && parentSessionId !== sessionId) {
      const parentRows = await db
        .select({ session_id: cli_sessions_v2.session_id })
        .from(cli_sessions_v2)
        .where(
          and(
            eq(cli_sessions_v2.session_id, parentSessionId),
            eq(cli_sessions_v2.kilo_user_id, kiloUserId)
          )
        )
        .limit(1);

      if (parentRows[0]) {
        await db
          .update(cli_sessions_v2)
          .set({ parent_session_id: parentSessionId })
          .where(
            and(
              eq(cli_sessions_v2.session_id, sessionId),
              eq(cli_sessions_v2.kilo_user_id, kiloUserId),
              sql`${cli_sessions_v2.parent_session_id} IS DISTINCT FROM ${parentSessionId}`
            )
          );
      }
    } else if (parentSessionId === null) {
      await db
        .update(cli_sessions_v2)
        .set({ parent_session_id: null })
        .where(
          and(
            eq(cli_sessions_v2.session_id, sessionId),
            eq(cli_sessions_v2.kilo_user_id, kiloUserId),
            sql`${cli_sessions_v2.parent_session_id} IS DISTINCT FROM ${parentSessionId}`
          )
        );
    }
  }
}

export async function queue(batch: MessageBatch<IngestQueueMessage>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processMessage(env, msg.body);
      msg.ack();
    } catch (err) {
      console.error('Queue message processing failed, will retry', {
        r2Key: msg.body.r2Key,
        sessionId: msg.body.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      msg.retry();
    }
  }
}
