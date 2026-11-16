import type pg from 'pg';
import { expect } from 'vitest';

type Queryable = Pick<pg.PoolClient, 'query'>;

export async function expectPgError(
  client: Queryable,
  sql: string,
  params: unknown[] | undefined,
  code: string,
): Promise<void> {
  await client.query('savepoint expect_err');
  await expect(client.query(sql, params)).rejects.toMatchObject({ code });
  await client.query('rollback to savepoint expect_err');
}
