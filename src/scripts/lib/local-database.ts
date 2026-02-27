import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@kilocode/db/schema';

export const localPool = new Pool({
  connectionString: 'postgres://postgres:postgres@localhost:5432/postgres',
  max: 10,
  application_name: 'local-kilo-script',
  ssl: false,
});

export const localDb = drizzle(localPool, { schema, logger: true });
