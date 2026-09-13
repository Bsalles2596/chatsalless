import { Pool } from 'pg';
import { env } from '../../config/env.js';

export const pool = env.DATABASE_URL
  ? new Pool({ connectionString: env.DATABASE_URL })
  : undefined;

export async function closeDatabase(): Promise<void> {
  if (pool) await pool.end();
}
