import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { OPENCLAW_PORT } from '../config';

/**
 * Public routes - no authentication required
 *
 * These routes are mounted BEFORE the auth middleware is applied.
 */
const publicRoutes = new Hono<AppEnv>();

// GET /health - Health check endpoint
publicRoutes.get('/health', c => {
  return c.json({
    status: 'ok',
    service: 'kiloclaw',
    gateway_port: OPENCLAW_PORT,
  });
});

// GET /public-key - RSA public key for encrypting secrets
// The google-setup container fetches this to encrypt Google OAuth credentials.
publicRoutes.get('/public-key', async c => {
  const privateKeyPem = c.env.AGENT_ENV_VARS_PRIVATE_KEY;
  if (!privateKeyPem) {
    return c.json({ error: 'Encryption not configured' }, 503);
  }

  try {
    const { createPublicKey } = await import('crypto');
    const publicKey = createPublicKey({ key: privateKeyPem, format: 'pem' });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    return c.json({ publicKey: publicKeyPem });
  } catch (err) {
    console.error('[public] Failed to derive public key:', err);
    return c.json({ error: 'Failed to derive public key' }, 500);
  }
});

export { publicRoutes };
