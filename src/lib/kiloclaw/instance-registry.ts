import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { kiloclaw_instances } from '@kilocode/db/schema';
import { db } from '@/lib/drizzle';
import { sandboxIdFromUserId, sandboxIdFromInstanceId } from '@/lib/kiloclaw/sandbox-id';

export type ActiveKiloClawInstance = {
  id: string;
  userId: string;
  sandboxId: string;
  instanceId: string | null;
  organizationId: string | null;
  name: string | null;
};

type EnsureActiveInstanceOpts = {
  /** 12-char hex instance identity. When provided, creates an instance-keyed row. */
  instanceId?: string;
  /** Organization ID. When provided, creates an org-owned instance. */
  orgId?: string;
};

/**
 * Ensure the user has an active KiloClaw registry row before worker provisioning.
 * This is idempotent and safe under concurrent calls.
 *
 * Without opts: legacy personal flow — sandboxId derived from userId.
 * With instanceId: new multi-instance flow — sandboxId derived from instanceId.
 * With instanceId + orgId: org instance.
 */
export async function ensureActiveInstance(
  userId: string,
  opts?: EnsureActiveInstanceOpts
): Promise<ActiveKiloClawInstance> {
  const sandboxId = opts?.instanceId
    ? sandboxIdFromInstanceId(opts.instanceId)
    : sandboxIdFromUserId(userId);

  const values: {
    user_id: string;
    sandbox_id: string;
    instance_id?: string;
    organization_id?: string;
  } = {
    user_id: userId,
    sandbox_id: sandboxId,
  };

  if (opts?.instanceId) {
    values.instance_id = opts.instanceId;
  }
  if (opts?.orgId) {
    values.organization_id = opts.orgId;
  }

  await db.insert(kiloclaw_instances).values(values).onConflictDoNothing();

  const [row] = await db
    .select({
      id: kiloclaw_instances.id,
      userId: kiloclaw_instances.user_id,
      sandboxId: kiloclaw_instances.sandbox_id,
      instanceId: kiloclaw_instances.instance_id,
      organizationId: kiloclaw_instances.organization_id,
      name: kiloclaw_instances.name,
    })
    .from(kiloclaw_instances)
    .where(
      and(
        eq(kiloclaw_instances.user_id, userId),
        eq(kiloclaw_instances.sandbox_id, sandboxId),
        isNull(kiloclaw_instances.destroyed_at)
      )
    )
    .limit(1);

  if (!row) {
    throw new Error('Failed to ensure active KiloClaw instance row');
  }

  return row;
}

/**
 * Soft-delete the active registry row for the user.
 * Returns the affected row so callers can revert on downstream failure.
 *
 * When instanceId is provided, finds the row by instance_id instead of
 * the legacy (userId, sandboxId) lookup. This supports multi-instance
 * where multiple rows may exist for one userId.
 */
export async function markActiveInstanceDestroyed(
  userId: string,
  instanceId?: string
): Promise<ActiveKiloClawInstance | null> {
  const destroyedAt = new Date().toISOString();

  const condition = instanceId
    ? and(eq(kiloclaw_instances.instance_id, instanceId), isNull(kiloclaw_instances.destroyed_at))
    : and(
        eq(kiloclaw_instances.user_id, userId),
        eq(kiloclaw_instances.sandbox_id, sandboxIdFromUserId(userId)),
        isNull(kiloclaw_instances.destroyed_at)
      );

  const [row] = await db
    .update(kiloclaw_instances)
    .set({ destroyed_at: destroyedAt })
    .where(condition)
    .returning({
      id: kiloclaw_instances.id,
      userId: kiloclaw_instances.user_id,
      sandboxId: kiloclaw_instances.sandbox_id,
      instanceId: kiloclaw_instances.instance_id,
      organizationId: kiloclaw_instances.organization_id,
      name: kiloclaw_instances.name,
    });

  return row ?? null;
}

/**
 * Soft-delete a specific instance row by its primary key.
 * Unlike {@link markActiveInstanceDestroyed} (which targets the user's
 * current active row), this targets exactly one row and is safe to use
 * for rollback when the caller knows which row it created.
 */
export async function markInstanceDestroyedById(instanceId: string): Promise<void> {
  await db
    .update(kiloclaw_instances)
    .set({ destroyed_at: new Date().toISOString() })
    .where(and(eq(kiloclaw_instances.id, instanceId), isNull(kiloclaw_instances.destroyed_at)));
}

/**
 * Revert a prior soft-delete (used when downstream destroy fails).
 * Note: `instanceId` here refers to the DB row UUID (kiloclaw_instances.id),
 * not the 12-char hex instance_id.
 */
export async function restoreDestroyedInstance(instanceId: string): Promise<void> {
  await db
    .update(kiloclaw_instances)
    .set({ destroyed_at: null })
    .where(eq(kiloclaw_instances.id, instanceId));
}

/**
 * Fetch the user's active KiloClaw instance (read-only, no upsert).
 */
export async function getActiveInstance(userId: string): Promise<ActiveKiloClawInstance | null> {
  const sandboxId = sandboxIdFromUserId(userId);

  const [row] = await db
    .select({
      id: kiloclaw_instances.id,
      userId: kiloclaw_instances.user_id,
      sandboxId: kiloclaw_instances.sandbox_id,
      instanceId: kiloclaw_instances.instance_id,
      organizationId: kiloclaw_instances.organization_id,
      name: kiloclaw_instances.name,
    })
    .from(kiloclaw_instances)
    .where(
      and(
        eq(kiloclaw_instances.user_id, userId),
        eq(kiloclaw_instances.sandbox_id, sandboxId),
        isNull(kiloclaw_instances.destroyed_at)
      )
    )
    .limit(1);

  return row ?? null;
}

/**
 * Update the display name of the user's active KiloClaw instance.
 * Pass null to clear the name.
 */
export async function renameInstance(userId: string, name: string | null): Promise<void> {
  const sandboxId = sandboxIdFromUserId(userId);
  const trimmed = name?.trim() || null;

  if (trimmed !== null && trimmed.length > 50) {
    throw new Error('Instance name must be 50 characters or fewer');
  }

  const result = await db
    .update(kiloclaw_instances)
    .set({ name: trimmed })
    .where(
      and(
        eq(kiloclaw_instances.user_id, userId),
        eq(kiloclaw_instances.sandbox_id, sandboxId),
        isNull(kiloclaw_instances.destroyed_at)
      )
    );

  if (result.rowCount === 0) {
    throw new Error('No active instance found');
  }
}
