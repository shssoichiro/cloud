// Durable Object SQL storage limits the maximum size of a string/BLOB/row to 2MiB.
// Use a safety margin so the stored row (which includes other columns/overhead)
// cannot exceed the platform limit.
export const MAX_INGEST_ITEM_BYTES = 2 * 1024 * 1024 - 64 * 1024;

// Durable Object RPC arguments/return values are limited to ~32MiB.
// Keep a safety margin for serialization overhead.
export const MAX_DO_INGEST_CHUNK_BYTES = 24 * 1024 * 1024;

// Items above this byte count are skipped during queue processing.
// Tracked incrementally during streaming parse — item is aborted as soon as it exceeds this.
export const MAX_SINGLE_ITEM_BYTES = 50 * 1024 * 1024;

const UTF8_ENCODER = new TextEncoder();

export function byteLengthUtf8(text: string): number {
  return UTF8_ENCODER.encode(text).byteLength;
}
