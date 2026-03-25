/**
 * Derive a deterministic sandbox ID from a user ID.
 *
 * Identical logic to kiloclaw/src/auth/sandbox-id.ts — base64url encoding
 * of the UTF-8 bytes of the userId. Used by the Next.js backend to
 * pre-generate sandbox_id when inserting the instance row into Postgres.
 *
 * Must stay in sync with the worker's sandboxIdFromUserId.
 */

const MAX_SANDBOX_ID_LENGTH = 63;

function bytesToBase64url(bytes: Uint8Array): string {
  const binString = Array.from(bytes, b => String.fromCodePoint(b)).join('');
  return btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function sandboxIdFromUserId(userId: string): string {
  const bytes = new TextEncoder().encode(userId);
  const encoded = bytesToBase64url(bytes);
  if (encoded.length > MAX_SANDBOX_ID_LENGTH) {
    throw new Error(
      `userId too long: encoded sandboxId would be ${encoded.length} chars (max ${MAX_SANDBOX_ID_LENGTH})`
    );
  }
  return encoded;
}

// ─── Instance-scoped identity ───────────────────────────────────────

/**
 * 12-char lowercase hex string used as the primary instance identity.
 * Must stay in sync with kiloclaw/src/auth/sandbox-id.ts.
 */
export const INSTANCE_ID_LENGTH = 12;
const INSTANCE_ID_RE = /^[0-9a-f]{12}$/;

export function generateInstanceId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, INSTANCE_ID_LENGTH);
}

export function isValidInstanceId(id: string): boolean {
  return INSTANCE_ID_RE.test(id);
}

/**
 * Derive a sandboxId from an instanceId (for new multi-instance instances).
 * Must stay in sync with kiloclaw/src/auth/sandbox-id.ts.
 */
export function sandboxIdFromInstanceId(instanceId: string): string {
  if (!isValidInstanceId(instanceId)) {
    throw new Error(`Invalid instanceId: must be ${INSTANCE_ID_LENGTH}-char hex`);
  }
  const prefixed = `ki_${instanceId}`;
  if (prefixed.length > MAX_SANDBOX_ID_LENGTH) {
    throw new Error(
      `instanceId too long: prefixed sandboxId would be ${prefixed.length} chars (max ${MAX_SANDBOX_ID_LENGTH})`
    );
  }
  return prefixed;
}
