import type { Hono } from 'hono';
import { timingSafeTokenEqual } from '../auth';
import type { Supervisor } from '../supervisor';
import { writeBaseConfig } from '../config-writer';
import { getBearerToken } from './gateway';

const VALID_VERSIONS = ['base'] as const;
type ConfigVersion = (typeof VALID_VERSIONS)[number];

function isValidVersion(v: string): v is ConfigVersion {
  return (VALID_VERSIONS as readonly string[]).includes(v);
}

export function registerConfigRoutes(
  app: Hono,
  supervisor: Supervisor,
  expectedToken: string
): void {
  app.use('/_kilo/config/*', async (c, next) => {
    const token = getBearerToken(c.req.header('authorization'));
    if (!timingSafeTokenEqual(token, expectedToken)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  });

  app.post('/_kilo/config/restore/:version', c => {
    const version = c.req.param('version');

    if (!isValidVersion(version)) {
      return c.json(
        { error: `Invalid config version: ${version}. Valid: ${VALID_VERSIONS.join(', ')}` },
        400
      );
    }

    try {
      writeBaseConfig(process.env);
      const signaled = supervisor.signal('SIGUSR1');
      if (!signaled) {
        console.warn(
          '[controller] Config restored but gateway process is not running — SIGUSR1 not sent'
        );
      }
      return c.json({ ok: true, signaled });
    } catch (error) {
      console.error('[controller] /_kilo/config/restore failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return c.json({ error: `Failed to restore config: ${message}` }, 500);
    }
  });
}
