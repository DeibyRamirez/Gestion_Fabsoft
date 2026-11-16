/**
 * T-F0-02 — roles runtime sin escalación (mapa docs/qa-f0-test-map.md)
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  RUNTIME_LOGIN_ROLES,
  assertRuntimeRolesNotPrivileged,
} from '../../scripts/guard.js';

const provisionUrl = process.env.DATABASE_PROVISION_URL ?? process.env.TEST_DATABASE_MIGRATION_URL;
if (process.env.REQUIRE_DB_TESTS === '1' && !provisionUrl) {
  throw new Error('roles.test: DATABASE_PROVISION_URL requerido en CI');
}

describe.skipIf(!provisionUrl)('F0 — roles efectivos', () => {
  it('T-F0-02 roles runtime/seed/migrator sin SUPERUSER ni BYPASSRLS', async () => {
    const client = new pg.Client({ connectionString: provisionUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>(
        `select rolname, rolsuper, rolbypassrls
         from pg_roles where rolname = any($1::text[]) order by 1`,
        [[...RUNTIME_LOGIN_ROLES, 'fabsoft_worker', 'fabsoft_secure_view']],
      );
      expect(rows.length).toBeGreaterThanOrEqual(RUNTIME_LOGIN_ROLES.length);
      expect(() => assertRuntimeRolesNotPrivileged(rows)).not.toThrow();
      const migratorRow = rows.find((r) => r.rolname === 'fabsoft_migrator');
      expect(migratorRow?.rolsuper).toBe(false);
      expect(migratorRow?.rolbypassrls).toBe(false);
    } finally {
      await client.end();
    }
  });

  it('T-F0-03 runtime LOGIN directo (fabsoft_app sin SET ROLE escalación)', async () => {
    const appUrl = process.env.TEST_DATABASE_URL;
    if (!appUrl) return;
    const u = decodeURIComponent(new URL(appUrl).username);
    expect(u).toBe('fabsoft_app');
    const client = new pg.Client({ connectionString: appUrl });
    await client.connect();
    try {
      const { rows } = await client.query<{ cu: string; su: string }>(
        `select current_user as cu, session_user as su`,
      );
      expect(rows[0]!.cu).toBe('fabsoft_app');
      expect(rows[0]!.su).toBe('fabsoft_app');
    } finally {
      await client.end();
    }
  });
});
