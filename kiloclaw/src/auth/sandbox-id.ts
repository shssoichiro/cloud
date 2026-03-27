/**
 * Reversible base64url encoding of userId into sandboxId.
 *
 * NOT the cloud-agent-next SHA-256 pattern -- we need to recover userId
 * from sandboxId in lifecycle hooks without a DB lookup.
 *
 * Uses TextEncoder/TextDecoder so non-Latin1 userIds (e.g. Unicode from
 * some IdPs) don't throw at runtime. ASCII userIds encode identically
 * to the old btoa() approach.
 *
 * No prefix -- the full 63-char sandboxId limit is available.
 */

const MAX_SANDBOX_ID_LENGTH = 63;

function bytesToBase64url(bytes: Uint8Array): string {
  const binString = Array.from(bytes, b => String.fromCodePoint(b)).join('');
  return btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(encoded: string): Uint8Array {
  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  const binString = atob(b64);
  return Uint8Array.from(binString, c => c.codePointAt(0) ?? 0);
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

export function userIdFromSandboxId(sandboxId: string): string {
  const bytes = base64urlToBytes(sandboxId);
  return new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(bytes);
}

// ─── Instance-scoped identity ───────────────────────────────────────

/**
 * 32-char lowercase hex string (full UUID without dashes) used as the
 * primary instance identity. 128 bits of entropy — effectively zero
 * collision risk at any scale.
 */
export const INSTANCE_ID_LENGTH = 32;
const INSTANCE_ID_RE = /^[0-9a-f]{32}$/;

export function generateInstanceId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export function isValidInstanceId(id: string): boolean {
  return INSTANCE_ID_RE.test(id);
}

/**
 * Derive a sandboxId from an instanceId (for new multi-instance instances).
 *
 * Uses a `ki_` prefix to distinguish from legacy userId-derived sandboxIds
 * (which are raw base64url). The prefix makes it trivial to tell which
 * derivation produced a given sandboxId without a DB lookup.
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
