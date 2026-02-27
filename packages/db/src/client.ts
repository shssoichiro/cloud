import { drizzle } from 'drizzle-orm/node-postgres';
import pg, { types } from 'pg';
import * as schema from './schema';
import { getDatabaseClientConfig } from './database-url';

// Drizzle requires this for BigInts
// https://orm.drizzle.team/docs/column-types/pg#bigint
types.setTypeParser(types.builtins.INT8, val => BigInt(val));

export type CreateDrizzleClientOptions = {
  connectionString: string;
  poolConfig?: Partial<pg.PoolConfig>;
  logger?: boolean;
  ssl?: { ca: string } | false;
};

export type DrizzleClient = ReturnType<typeof createDrizzleClient>;

export function createDrizzleClient(options: CreateDrizzleClientOptions) {
  const { connectionString, poolConfig = {}, logger = false, ssl } = options;

  const baseConfig = getDatabaseClientConfig(connectionString);
  if (ssl !== undefined) {
    baseConfig.ssl = ssl;
  }

  const pool = new pg.Pool({
    ...baseConfig,
    ...poolConfig,
  });

  const db = drizzle(pool, { schema, logger });

  return { db, pool, schema };
}

export { pg };
