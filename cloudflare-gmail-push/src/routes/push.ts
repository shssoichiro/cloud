import { Hono } from 'hono';
import type { HonoContext } from '../types';
import { validateOidcToken } from '../auth/oidc';
import { verifyPushToken } from '../auth/push-token';

export const pushRoute = new Hono<HonoContext>();

pushRoute.post('/user/:userId/:token', async c => {
  const userId = c.req.param('userId');
  const token = c.req.param('token');

  // Verify URL-embedded HMAC token (prevents unauthenticated push to arbitrary userIds)
  const tokenValid = await verifyPushToken(token, userId, c.env.INTERNAL_API_SECRET);
  if (!tokenValid) {
    console.warn(`[gmail-push] Invalid push token for user ${userId}`);
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Optional defense-in-depth: validate Google OIDC token if present.
  // Primary auth is the HMAC URL token above. OIDC can be enabled by
  // configuring --push-auth-service-account on the Pub/Sub subscription.
  // Invalid tokens are still rejected; missing tokens are allowed.
  const authHeader = c.req.header('authorization');
  if (authHeader) {
    const oidcResult = await validateOidcToken(authHeader, c.env.OIDC_AUDIENCE);
    if (!oidcResult.valid) {
      console.warn(`[gmail-push] OIDC validation failed for user ${userId}: ${oidcResult.error}`);
      return c.json({ error: 'Unauthorized' }, 401);
    }
  } else {
    console.warn(`[gmail-push] No OIDC token for user ${userId} push — proceeding without auth`);
  }

  const pubSubBody = await c.req.text();
  await c.env.GMAIL_PUSH_QUEUE.send({ userId, pubSubBody });

  return c.json({ ok: true }, 200);
});
