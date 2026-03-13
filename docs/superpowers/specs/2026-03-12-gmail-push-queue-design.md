# Gmail Push Worker: Cloudflare Queue Integration

## Problem

The gmail-push worker currently performs auth verification, machine lookup, and controller delivery synchronously in the HTTP request path. This couples Google Pub/Sub's retry behavior to downstream availability — if the controller's machine is starting up or temporarily unavailable, the notification is either dropped (machine not running) or retried by Google on its own schedule.

## Solution

Insert a Cloudflare Queue between the HTTP handler (producer) and the delivery logic (consumer). The producer validates auth and enqueues; the consumer handles delivery with retries owned by us.

## Architecture

```
Google Pub/Sub
  |
  v
POST /push/user/:userId
  | Verify OIDC JWT (mandatory)
  | Enqueue { userId, pubSubBody }
  | Return 200 OK
  |
  v
Cloudflare Queue: gmail-push-notifications[-dev]
  |
  v
Queue consumer (same worker, processes batch)
  | For each message:
  |   Lookup machine status via kiloclaw service binding
  |   If machine not running -> message.retry()
  |   Lookup gateway token via kiloclaw
  |   Forward to Fly controller
  |   If 2xx/4xx -> message.ack()
  |   If 5xx/network error -> message.retry()
  |   After 10 retries exhausted -> message dropped, logged
```

Key behavioral change: Google Pub/Sub **always gets 200** for authenticated requests. Delivery retries are owned by the queue, not Google.

## Queue Message Shape

```typescript
interface GmailPushQueueMessage {
  userId: string;
  pubSubBody: string; // raw JSON string from Google
}
```

No machine info is cached in the message. The consumer does a fresh kiloclaw lookup on every attempt so routing info stays current — important for retries where machine state may have changed between attempts.

## Consumer Error Handling

Each message in a batch is handled independently using `message.ack()` and `message.retry()` — never `throw`, which would retry the entire batch.

| Scenario                                   | Action                                      |
| ------------------------------------------ | ------------------------------------------- |
| Kiloclaw status lookup fails (network/5xx) | `message.retry()`                           |
| Machine not running                        | `message.retry()`                           |
| Gateway token lookup fails                 | `message.retry()`                           |
| Controller returns 2xx                     | `message.ack()`                             |
| Controller returns 4xx                     | `message.ack()` (permanent error, no retry) |
| Controller returns 5xx                     | `message.retry()`                           |
| Controller network error                   | `message.retry()`                           |
| 10 retries exhausted                       | Message dropped, logged                     |

## Retry Policy

- **Max retries:** 10
- **Retry delay:** 60 seconds between retries. Cloudflare Queues does not apply exponential backoff by default — without `retry_delay`, retries fire immediately. A 60s delay gives machines time to start up, totaling ~10 minutes max before a message is dropped.
- **No dead-letter queue:** Messages that exhaust retries are dropped and logged. Google's watch mechanism will re-fire on the next interval anyway.

## File Changes

### `src/types.ts` — Add queue types to env bindings

```typescript
export interface GmailPushQueueMessage {
  userId: string;
  pubSubBody: string;
}

export type Env = {
  KILOCLAW: Fetcher;
  OIDC_AUDIENCE: string;
  INTERNAL_API_SECRET: string;
  GMAIL_PUSH_QUEUE: Queue<GmailPushQueueMessage>;
};
```

### `src/routes/push.ts` — Slim down to auth + enqueue

After auth verification, read the body as a string with `await c.req.text()` (the current code streams the body via `c.req.raw.body` — we must buffer it to enqueue as a string). Enqueue `{ userId, pubSubBody }` and return 200. All kiloclaw lookup and controller forwarding logic is removed from this file.

### `src/consumer.ts` — New file: queue consumer logic

Exports a queue handler matching the Cloudflare Workers queue handler signature:

```typescript
export async function handleQueue(
  batch: MessageBatch<GmailPushQueueMessage>,
  env: Env
): Promise<void>;
```

Iterates over `batch.messages`, handling each independently with `message.ack()` / `message.retry()`:

1. Get `userId` and `pubSubBody` from `message.body`
2. Lookup machine status via `env.KILOCLAW` service binding
3. If machine not running → `message.retry()`
4. Lookup gateway token via `env.KILOCLAW`
5. Forward `pubSubBody` to `https://{flyAppName}.fly.dev/_kilo/gmail-pubsub` with `content-type: application/json`, bearer token, and `fly-force-instance-id` headers
6. If controller returns 2xx or 4xx → `message.ack()`
7. If controller returns 5xx or network error → `message.retry()`

Per-message ack/retry ensures a failure in one message does not affect others in the batch.

### `src/index.ts` — Export queue handler alongside fetch

```typescript
export default {
  fetch: app.fetch,
  queue: handleQueue,
};
```

The Hono app stays as the fetch handler. The queue handler is a separate export.

### `wrangler.jsonc` — Add queue producer + consumer config

**Production:**

```jsonc
{
  "queues": {
    "producers": [{ "binding": "GMAIL_PUSH_QUEUE", "queue": "gmail-push-notifications" }],
    "consumers": [{ "queue": "gmail-push-notifications", "max_retries": 10, "retry_delay": 60 }],
  },
}
```

**Dev environment:**

```jsonc
{
  "env": {
    "dev": {
      "queues": {
        "producers": [{ "binding": "GMAIL_PUSH_QUEUE", "queue": "gmail-push-notifications-dev" }],
        "consumers": [
          { "queue": "gmail-push-notifications-dev", "max_retries": 10, "retry_delay": 60 },
        ],
      },
    },
  },
}
```

### Tests

- **`src/routes/push.test.ts`** — Update the env mock (the existing middleware injection pattern) to include a mock `GMAIL_PUSH_QUEUE` with a `send()` spy. Verify: auth still rejects invalid tokens (403/401), valid requests call `queue.send()` with `{ userId, pubSubBody }` and return 200.
- **`src/consumer.test.ts`** — New file. Mock `env.KILOCLAW` service binding and global `fetch`. Test: machine not running calls `message.retry()`, successful delivery calls `message.ack()`, controller 4xx calls `message.ack()`, controller 5xx calls `message.retry()`, network error calls `message.retry()`.

## What Doesn't Change

- OIDC validation logic (mandatory now instead of optional)
- Health endpoint
- Service binding to kiloclaw
- The controller's `/_kilo/gmail-pubsub` API contract
