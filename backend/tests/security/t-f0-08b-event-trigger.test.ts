/**
 * T-F0-08b — aislado para develop-upgrade (sin fixtures de rls-effective).
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';

const migratorUrl = process.env.DATABASE_MIGRATION_URL;

if (process.env.REQUIRE_DB_TESTS === '1' && !migratorUrl) {
  throw new Error('t-f0-08b: DATABASE_MIGRATION_URL requerido');
}

describe.skipIf(!migratorUrl || process.env.FABSOFT_EXPECT_EVENT_TRIGGER !== '1')(
  'F0 — event trigger upgrade (T-F0-08b)',
  () => {
  it('T-F0-08b event trigger fabsoft_enforce_rls en ruta upgrade', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{ evtname: string }>(
        `select evtname from pg_event_trigger where evtname = 'fabsoft_enforce_rls'`,
      );
      expect(process.env.FABSOFT_EXPECT_EVENT_TRIGGER).toBe('1');
      expect(rows.map((r) => r.evtname)).toContain('fabsoft_enforce_rls');
    } finally {
      await client.end();
    }
  });
});
