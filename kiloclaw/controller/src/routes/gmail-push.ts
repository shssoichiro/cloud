import type { Hono } from 'hono';
import type { Supervisor } from '../supervisor';
import { timingSafeTokenEqual } from '../auth';
import { getBearerToken } from './gateway';

const GMAIL_WATCH_PORT = 3002;

export function registerGmailPushRoute(
  app: Hono,
  gmailWatchSupervisor: Supervisor | null,
  expectedToken: string
): void {
  app.post('/_kilo/gmail-pubsub', async c => {
    if (!gmailWatchSupervisor) {
      return c.json({ error: 'Gmail watch not configured' }, 404);
    }

    const token = getBearerToken(c.req.header('authorization'));
    if (!token || !timingSafeTokenEqual(token, expectedToken)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (gmailWatchSupervisor.getState() !== 'running') {
      return c.json({ error: 'Gmail watch process not running' }, 503);
    }

    try {
      const upstream = await fetch(`http://127.0.0.1:${GMAIL_WATCH_PORT}/`, {
        method: 'POST',
        headers: { 'content-type': c.req.header('content-type') ?? 'application/json' },
        body: c.req.raw.body,
        // Required for streaming body in Node.js fetch
        duplex: 'half',
      } as RequestInit);

      if (upstream.ok) {
        return c.json({ ok: true }, 200);
      }

      // 4xx = permanently rejected, return 200 so Pub/Sub doesn't retry
      if (upstream.status >= 400 && upstream.status < 500) {
        console.warn(`[gmail-push] Downstream rejected with ${upstream.status}`);
        return c.json({ ok: true, downstreamStatus: upstream.status }, 200);
      }

      // 5xx = transient error, return 500 so Pub/Sub retries
      console.error(`[gmail-push] Downstream error: ${upstream.status}`);
      return c.json({ error: 'Upstream error' }, 500);
    } catch (err) {
      console.error('[gmail-push] Failed to reach gmail watch process:', err);
      return c.json({ error: 'Gmail watch process unreachable' }, 500);
    }
  });
}
