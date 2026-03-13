import { Hono } from 'hono';
import { z } from 'zod';
import type { HonoContext } from '../types';
import { validateOidcToken } from '../auth/oidc';

const PubSubMessageIdSchema = z.looseObject({
  message: z.looseObject({
    messageId: z.string(),
  }),
});

export const pushRoute = new Hono<HonoContext>();

pushRoute.post('/user/:userId', async c => {
  const userId = c.req.param('userId');

  // Validate Google OIDC token (mandatory).
  // Each user's Pub/Sub subscription uses a per-user audience that embeds the userId,
  // so the audience check implicitly binds the token to this specific user.
  const perUserAudience = `${c.env.OIDC_AUDIENCE_BASE}/push/user/${userId}`;
  const oidcResult = await validateOidcToken(c.req.header('authorization'), perUserAudience);
  if (!oidcResult.valid) {
    console.warn(`[gmail-push] OIDC validation failed for user ${userId}: ${oidcResult.error}`);
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const pubSubBody = await c.req.text();
  if (pubSubBody.length > 65_536) {
    return c.json({ error: 'Payload too large' }, 413);
  }

  // Extract Pub/Sub messageId for idempotency; fall back to a random UUID
  let messageId: string;
  try {
    const parsed = PubSubMessageIdSchema.safeParse(JSON.parse(pubSubBody));
    messageId = parsed.success ? parsed.data.message.messageId : crypto.randomUUID();
  } catch {
    messageId = crypto.randomUUID();
  }

  await c.env.GMAIL_PUSH_QUEUE.send({ userId, pubSubBody, messageId });

  return c.json({ ok: true }, 200);
});
