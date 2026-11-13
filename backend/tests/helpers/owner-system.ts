import type pg from 'pg';
import { getOwnerPool } from './db.js';

/** Inserts de preparación con contexto `system` (triggers de pricing, etc.). Sólo fixtures de seguridad autorizados. */
export async function withOwnerSystemContext<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getOwnerPool().connect();
  try {
    await client.query('begin');
    await client.query(
      `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
    );
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
