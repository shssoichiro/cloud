import { readDb, sql } from '@/lib/drizzle';
import { microdollar_usage } from '@kilocode/db/schema';
import { captureException } from '@sentry/nextjs';
import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';

type ModelStat = {
  model: string;
  cost: number;
  costPerRequest: number;
};

type ModelStatsError = {
  error: string;
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
} satisfies Record<string, string>;

const getCachedModelStat = unstable_cache(
  async (model: string): Promise<ModelStat | null> => {
    const result = await readDb.execute<{
      requested_model: string;
      cost: string;
      costPerRequest: string;
    }>(sql`
      select
        requested_model,
        sum(cost) / sum(input_tokens + output_tokens) as cost,
        sum(cost) / count(*) / 1000000 as "costPerRequest"
      from ${microdollar_usage}
      where
        created_at > now() - interval '7 days'
        and requested_model = ${model}
        and input_tokens + output_tokens > 0
        and cost > 0
      group by requested_model
    `);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      model: row.requested_model,
      cost: Number(row.cost),
      costPerRequest: Number(row.costPerRequest),
    };
  },
  undefined,
  { revalidate: 3600 }
);

type ModelStatsResponse = ModelStat[] | ModelStat | ModelStatsError;

export async function GET(request: Request): Promise<NextResponse<ModelStatsResponse>> {
  const { searchParams } = new URL(request.url);
  const model = searchParams.get('model');

  if (model === null) {
    return NextResponse.json(
      { error: '`model` parameter must be specified' },
      {
        status: 400,
        headers: CORS_HEADERS,
      }
    );
  }

  // this route with `?model=` filtering is optimized
  // to be usable moving forward
  try {
    const stat = await getCachedModelStat(model);

    if (!stat) {
      return NextResponse.json(
        { error: 'Model stats not found' },
        {
          status: 404,
          headers: CORS_HEADERS,
        }
      );
    }

    return NextResponse.json(stat, {
      headers: CORS_HEADERS,
    });
  } catch (error) {
    captureException(error, {
      tags: { endpoint: 'modelstats', source: 'model_lookup' },
      extra: { model },
    });

    return NextResponse.json(
      { error: 'Failed to load model stats' },
      {
        status: 500,
        headers: CORS_HEADERS,
      }
    );
  }
}
