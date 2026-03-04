import { execFileSync } from 'node:child_process';
import type { Context, Hono } from 'hono';
import { timingSafeTokenEqual } from '../auth';
import type { Supervisor } from '../supervisor';
import { CONTROLLER_COMMIT, CONTROLLER_VERSION } from '../version';
import { getBearerToken } from './gateway';

/** Resolve the installed openclaw version once and cache it for the process lifetime. */
let cachedOpenclawVersion: string | null | undefined;
function getOpenclawVersion(): string | null {
  if (cachedOpenclawVersion !== undefined) return cachedOpenclawVersion;
  try {
    cachedOpenclawVersion = execFileSync('/usr/bin/env', ['HOME=/root', 'openclaw', '--version'], {
      timeout: 5000,
    })
      .toString()
      .trim();
  } catch {
    cachedOpenclawVersion = null;
  }
  return cachedOpenclawVersion;
}

export function registerHealthRoute(
  app: Hono,
  supervisor: Supervisor,
  expectedToken?: string
): void {
  const handler = (c: Context) => c.json({ status: 'ok' });

  // Public Fly health probe endpoint. Keep response intentionally minimal.
  app.get('/_kilo/health', handler);
  // Compatibility alias to match the same minimal, public health response.
  app.get('/health', handler);

  // Authenticated version/diagnostics endpoint.
  app.get('/_kilo/version', c => {
    if (expectedToken) {
      const token = getBearerToken(c.req.header('authorization'));
      if (!timingSafeTokenEqual(token, expectedToken)) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
    }

    return c.json({
      version: CONTROLLER_VERSION,
      commit: CONTROLLER_COMMIT,
      openclawVersion: getOpenclawVersion(),
      gateway: supervisor.getStats(),
    });
  });
}
