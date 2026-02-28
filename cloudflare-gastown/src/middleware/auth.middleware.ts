import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { verifyAgentJWT, type AgentJWTPayload } from '../util/jwt.util';
import { resError } from '../util/res.util';
import type { GastownEnv } from '../gastown.worker';

export type AuthVariables = {
  agentJWT: AgentJWTPayload;
  townId: string;
};

import { resolveSecret } from '../util/secret.util';

/**
 * Auth middleware that requires a valid Gastown agent JWT via
 * `Authorization: Bearer <jwt>`.
 *
 * Sets `agentJWT` and `townId` on the Hono context. Returns 403 if the
 * JWT's townId doesn't match the route's `:townId` param (cross-town access).
 */
export const authMiddleware = createMiddleware<GastownEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return c.json(resError('Authentication required'), 401);
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return c.json(resError('Missing token'), 401);
  }

  const secret = await resolveSecret(c.env.GASTOWN_JWT_SECRET);
  if (!secret) {
    console.error('[auth] GASTOWN_JWT_SECRET not configured');
    return c.json(resError('Internal server error'), 500);
  }

  const result = verifyAgentJWT(token, secret);
  if (!result.success) {
    return c.json(resError(result.error), 401);
  }

  // Verify the rigId in the JWT matches the route param
  const rigId = c.req.param('rigId');
  if (rigId && result.payload.rigId !== rigId) {
    return c.json(resError('Token rigId does not match route'), 403);
  }

  c.set('agentJWT', result.payload);

  // Resolve and validate townId so handlers can use c.get('townId') directly.
  const townIdResult = resolveTownId(c);
  if (townIdResult.error) {
    const message =
      townIdResult.error === 'forbidden' ? 'Cross-town access denied' : 'Missing townId';
    return c.json(resError(message), townIdResult.status);
  }
  c.set('townId', townIdResult.townId);

  return next();
});

/**
 * Restricts a route to the specific agent identified by the JWT.
 * Validates the agentId route param matches the JWT agentId.
 * Must be applied after `authMiddleware`.
 */
export const agentOnlyMiddleware = createMiddleware<GastownEnv>(async (c, next) => {
  const jwt = c.get('agentJWT');
  if (!jwt) {
    return c.json(resError('Authentication required'), 401);
  }

  const agentId = c.req.param('agentId');
  if (agentId && jwt.agentId !== agentId) {
    return c.json(resError('Token agentId does not match route'), 403);
  }

  return next();
});

/**
 * When the request is agent-authenticated, returns the JWT's agentId.
 */
export function getEnforcedAgentId(c: Context<GastownEnv>): string | null {
  const jwt = c.get('agentJWT');
  if (!jwt) return null;
  return jwt.agentId;
}

type TownIdResult =
  | { townId: string; error?: undefined }
  | { townId?: undefined; error: 'missing'; status: 400 }
  | { townId?: undefined; error: 'forbidden'; status: 403 };

/**
 * Resolve townId from the route param `:townId`, falling back to the JWT's
 * `townId`. When both are present, verifies they match to prevent an agent
 * authenticated for town A from accessing town B's data via URL manipulation.
 *
 * Returns a discriminated result: either the resolved townId, a 400 (no
 * townId available), or a 403 (cross-town access attempt).
 */
function resolveTownId(c: Context<GastownEnv>): TownIdResult {
  const fromParam = c.req.param('townId');
  const jwt = c.get('agentJWT');

  if (fromParam && jwt?.townId && fromParam !== jwt.townId) {
    return { error: 'forbidden', status: 403 };
  }

  const townId = fromParam ?? jwt?.townId;
  if (!townId) return { error: 'missing', status: 400 };
  return { townId };
}
