/**
 * T-F0-03b — dbmate rechaza DATABASE_MIGRATION_URL que no sea fabsoft_migrator restringido.
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  assertMigratorMigrationSession,
  assertMigratorMigrationUser,
} from '../../scripts/guard.js';

const migratorUrl = process.env.DATABASE_MIGRATION_URL;
const provisionUrl = process.env.DATABASE_PROVISION_URL ?? process.env.TEST_DATABASE_MIGRATION_URL;

if (process.env.REQUIRE_DB_TESTS === '1' && (!migratorUrl || !provisionUrl)) {
  throw new Error('migrator-connection: faltan URLs en CI');
}

describe.skipIf(!migratorUrl)('F0 — conexión migrator (T-F0-03b)', () => {
  it('T-F0-03b rechaza URL de provisioner como DATABASE_MIGRATION_URL', () => {
    expect(() => assertMigratorMigrationUser(provisionUrl!)).toThrow(/fabsoft_migrator/);
  });

  it('acepta sesión LOGIN fabsoft_migrator sin superusuario', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      await expect(
        assertMigratorMigrationSession(migratorUrl!, (sql, params) => client.query(sql, params)),
      ).resolves.toMatchObject({ sessionUser: 'fabsoft_migrator', rolsuper: false });
    } finally {
      await client.end();
    }
  });
});
