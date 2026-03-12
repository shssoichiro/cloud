import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoContext } from '../types';
import { pushRoute } from './push';
import { generatePushToken } from '../auth/push-token';

// Mock the OIDC module
vi.mock('../auth/oidc', () => ({
  validateOidcToken: vi.fn(),
}));

import { validateOidcToken } from '../auth/oidc';

const mockValidateOidc = vi.mocked(validateOidcToken);

const TEST_SECRET = 'test-internal-secret';
const TEST_USER = 'user123';
let validToken: string;

function createApp() {
  const app = new Hono<HonoContext>();
  const mockKiloclaw = {
    fetch: vi.fn(),
  };
  const mockQueue = {
    send: vi.fn(),
  };

  app.use('*', async (c, next) => {
    c.env = {
      KILOCLAW: mockKiloclaw as unknown as Fetcher,
      OIDC_AUDIENCE: 'https://test-audience.example.com',
      INTERNAL_API_SECRET: 'test-internal-secret',
      GMAIL_PUSH_QUEUE: mockQueue as unknown as Queue,
    };
    await next();
  });

  app.route('/push', pushRoute);
  return { app, mockKiloclaw, mockQueue };
}

describe('POST /push/user/:userId/:token', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    validToken = await generatePushToken(TEST_USER, TEST_SECRET);
  });

  it('rejects invalid push token', async () => {
    const { app } = createApp();

    const res = await app.request(`/push/user/${TEST_USER}/badtoken${'0'.repeat(25)}`, {
      method: 'POST',
      body: JSON.stringify({ message: { data: 'dGVzdA==' } }),
    });

    expect(res.status).toBe(403);
  });

  it('rejects invalid OIDC token', async () => {
    mockValidateOidc.mockResolvedValue({ valid: false, error: 'bad token' });
    const { app } = createApp();

    const res = await app.request(`/push/user/${TEST_USER}/${validToken}`, {
      method: 'POST',
      headers: { authorization: 'Bearer bad-token' },
      body: JSON.stringify({ message: { data: 'dGVzdA==' } }),
    });

    expect(res.status).toBe(401);
  });

  it('enqueues message and returns 200 for valid auth (with OIDC)', async () => {
    mockValidateOidc.mockResolvedValue({
      valid: true,
      email: 'gmail-api-push@system.gserviceaccount.com',
    });
    const { app, mockQueue } = createApp();
    const pubSubBody = JSON.stringify({ message: { data: 'dGVzdA==', messageId: '123' } });

    const res = await app.request(`/push/user/${TEST_USER}/${validToken}`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: pubSubBody,
    });

    expect(res.status).toBe(200);
    expect(mockQueue.send).toHaveBeenCalledOnce();
    expect(mockQueue.send).toHaveBeenCalledWith({
      userId: TEST_USER,
      pubSubBody,
    });
  });

  it('proceeds without OIDC auth header (warns but does not reject)', async () => {
    const { app, mockQueue } = createApp();
    const pubSubBody = JSON.stringify({ message: { data: 'dGVzdA==' } });

    const res = await app.request(`/push/user/${TEST_USER}/${validToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: pubSubBody,
    });

    expect(res.status).toBe(200);
    expect(mockValidateOidc).not.toHaveBeenCalled();
    expect(mockQueue.send).toHaveBeenCalledOnce();
  });
});
