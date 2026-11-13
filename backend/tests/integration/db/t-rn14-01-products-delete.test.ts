import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createFactories } from '../../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  migrationUrl,
  resetDatabase,
  withAppContext,
} from '../../helpers/db.js';

assertDbTestsRequired();

async function expectPgError(
  c: pg.PoolClient,
  sql: string,
  params: unknown[],
  code: string,
): Promise<void> {
  await c.query('savepoint expect_err');
  await expect(c.query(sql, params)).rejects.toMatchObject({ code });
  await c.query('rollback to savepoint expect_err');
}

/** T-RN14-01 — DELETE físico en app.products bloqueado (REVOKE + tg_prevent_delete). */
describe.skipIf(!dbTestsConfigured())('T-RN14-01 DELETE en app.products', () => {
  const factories = createFactories();
  const ownerPool = new pg.Pool({ connectionString: migrationUrl, max: 2 });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
  });

  afterAll(async () => {
    await ownerPool.end();
    await closeTestPools();
  });

  it('falla como fabsoft_app (REVOKE DELETE)', async () => {
    const product = await factories.product();
    const admin = await factories.adminUser();

    await withAppContext(
      { role: 'admin', userId: admin.id, clientId: null, requestId: 't-rn14-01' },
      async (c) => {
        await expectPgError(c, 'delete from app.products where id = $1', [product.id], '42501');
      },
    );
  });

  it('falla como propietario (tg_prevent_delete)', async () => {
    const product = await factories.product();
    const c = await ownerPool.connect();
    try {
      await c.query('begin');
      await expectPgError(c, 'delete from app.products where id = $1', [product.id], 'P0001');
      await c.query('rollback');
    } finally {
      c.release();
    }
  });
});
