import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { NextRequest } from 'next/server';

type ModelLookupRow = {
  requested_model: string;
  cost: string;
  costPerRequest: string;
};

type ModelLookupResult = {
  rows: ModelLookupRow[];
};

const mockExecute = jest.fn<(query: unknown) => Promise<ModelLookupResult>>();

jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock('@/lib/drizzle', () => ({
  readDb: {
    execute: mockExecute,
  },
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

describe('GET /api/modelstats', () => {
  beforeEach(() => {
    jest.resetModules();
    mockExecute.mockReset();
  });

  test('returns 400 when model is omitted', async () => {
    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost:3000/api/modelstats'));

    expect(response.status).toBe(400);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await response.json()).toEqual({
      error: '`model` parameter must be specified',
    });
  });

  test('returns live stats for the requested model', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          requested_model: 'openai/gpt-5.4',
          cost: '1.05938032698464',
          costPerRequest: '0.0800828164797871',
        },
      ],
    });

    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest('http://localhost:3000/api/modelstats?model=openai%2Fgpt-5.4')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await response.json()).toEqual({
      model: 'openai/gpt-5.4',
      cost: 1.05938032698464,
      costPerRequest: 0.0800828164797871,
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  test('returns 404 when the requested model has no data', async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest('http://localhost:3000/api/modelstats?model=does-not-exist')
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await response.json()).toEqual({ error: 'Model stats not found' });
  });

  test('treats an empty model parameter as a lookup instead of falling back', async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    const { GET } = await import('./route');
    const response = await GET(new NextRequest('http://localhost:3000/api/modelstats?model='));

    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
