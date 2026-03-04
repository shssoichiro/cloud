import { execFile } from 'node:child_process';
import type { Context, Hono } from 'hono';
import { timingSafeTokenEqual } from '../auth';
import type { Supervisor } from '../supervisor';
import { CONTROLLER_COMMIT, CONTROLLER_VERSION } from '../version';
import { getBearerToken } from './gateway';

/**
 * Resolve the installed openclaw version once and cache it for the process lifetime.
 * If the user upgrades openclaw while the controller is running, the cached value
 * becomes stale until the next redeploy (which restarts the controller process).
 * This is acceptable: the UI shows a "Modified" badge by comparing image vs running
 * version, and spawning a subprocess on every request is not worth the cost.
 */
let cachedOpenclawVersion: string | null | undefined;
function getOpenclawVersion(): Promise<string | null> {
  if (cachedOpenclawVersion !== undefined) return Promise.resolve(cachedOpenclawVersion);
  return new Promise(resolve => {
    execFile(
      '/usr/bin/env',
      ['HOME=/root', 'openclaw', '--version'],
      { timeout: 5000 },
      (err, stdout) => {
        cachedOpenclawVersion = err ? null : stdout.toString().trim();
        resolve(cachedOpenclawVersion);
      }
    );
  });
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
  app.get('/_kilo/version', async c => {
    if (expectedToken) {
      const token = getBearerToken(c.req.header('authorization'));
      if (!timingSafeTokenEqual(token, expectedToken)) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
    }

    return c.json({
      version: CONTROLLER_VERSION,
      commit: CONTROLLER_COMMIT,
      openclawVersion: await getOpenclawVersion(),
      gateway: supervisor.getStats(),
    });
  });
}
