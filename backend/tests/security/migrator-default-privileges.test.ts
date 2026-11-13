/**
 * PO: ALTER DEFAULT PRIVILEGES global del migrator — funciones nuevas sin EXECUTE PUBLIC.
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';

const migratorUrl = process.env.DATABASE_MIGRATION_URL;

if (process.env.REQUIRE_DB_TESTS === '1' && !migratorUrl) {
  throw new Error('migrator-default-privileges: DATABASE_MIGRATION_URL requerido');
}

describe.skipIf(!migratorUrl)('Migrator default privileges', () => {
  it('nueva función como migrator: public sin EXECUTE; app sólo con grant explícito', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      await client.query('begin');
      await client.query(
        `create or replace function app.zz_global_default_priv_probe() returns int language sql as $$ select 1 $$`,
      );
      const { rows } = await client.query<{ pub: boolean; app: boolean }>(
        `select has_function_privilege('public', 'app.zz_global_default_priv_probe()', 'EXECUTE') as pub,
                has_function_privilege('fabsoft_app', 'app.zz_global_default_priv_probe()', 'EXECUTE') as app`,
      );
      expect(rows[0]!.pub).toBe(false);
      expect(rows[0]!.app).toBe(false);
      await client.query(
        `grant execute on function app.zz_global_default_priv_probe() to fabsoft_app`,
      );
      const { rows: afterGrant } = await client.query<{ app: boolean }>(
        `select has_function_privilege('fabsoft_app', 'app.zz_global_default_priv_probe()', 'EXECUTE') as app`,
      );
      expect(afterGrant[0]!.app).toBe(true);
      await client.query('rollback');
    } finally {
      await client.end();
    }
  });
});
