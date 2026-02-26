import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { registerConfigRoutes } from './config';
import type { Supervisor } from '../supervisor';

vi.mock('../config-writer', () => ({
  writeBaseConfig: vi.fn(),
}));

import { writeBaseConfig } from '../config-writer';

function createMockSupervisor(): Supervisor {
  const state = 'running' as const;
  return {
    start: vi.fn(async () => true),
    stop: vi.fn(async () => true),
    restart: vi.fn(async () => true),
    shutdown: vi.fn(async () => undefined),
    signal: vi.fn(() => true),
    getState: vi.fn(() => state),
    getStats: vi.fn(() => ({
      state,
      pid: 100,
      uptime: 50,
      restarts: 3,
      lastExit: null,
    })),
  };
}

function authHeaders(token = 'test-token'): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

describe('/_kilo/config routes', () => {
  it('rejects requests without auth', async () => {
    const app = new Hono();
    const supervisor = createMockSupervisor();
    registerConfigRoutes(app, supervisor, 'test-token');

    const resp = await app.request('/_kilo/config/restore/base', { method: 'POST' });
    expect(resp.status).toBe(401);
  });

  it('rejects requests with wrong token', async () => {
    const app = new Hono();
    const supervisor = createMockSupervisor();
    registerConfigRoutes(app, supervisor, 'test-token');

    const resp = await app.request('/_kilo/config/restore/base', {
      method: 'POST',
      headers: authHeaders('wrong-token'),
    });
    expect(resp.status).toBe(401);
  });

  it('rejects invalid version', async () => {
    const app = new Hono();
    const supervisor = createMockSupervisor();
    registerConfigRoutes(app, supervisor, 'test-token');

    const resp = await app.request('/_kilo/config/restore/unknown', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toContain('Invalid config version');
  });

  it('restores base config, signals SIGUSR1, and returns ok', async () => {
    const app = new Hono();
    const supervisor = createMockSupervisor();
    registerConfigRoutes(app, supervisor, 'test-token');

    const resp = await app.request('/_kilo/config/restore/base', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ ok: true, signaled: true });

    expect(writeBaseConfig).toHaveBeenCalledWith(process.env);
    expect(supervisor.signal).toHaveBeenCalledWith('SIGUSR1');
  });

  it('returns 500 when config write fails', async () => {
    const app = new Hono();
    const supervisor = createMockSupervisor();
    registerConfigRoutes(app, supervisor, 'test-token');

    vi.mocked(writeBaseConfig).mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const resp = await app.request('/_kilo/config/restore/base', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(resp.status).toBe(500);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toContain('disk full');
  });

  it('does not leak through to catch-all proxy', async () => {
    const app = new Hono();
    const supervisor = createMockSupervisor();
    registerConfigRoutes(app, supervisor, 'test-token');
    app.all('*', c => c.json({ proxied: true }));

    const resp = await app.request('/_kilo/config/restore/base');
    expect(resp.status).toBe(401);
    expect(await resp.json()).toEqual({ error: 'Unauthorized' });
  });
});
