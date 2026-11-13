/**
 * P0 — EXECUTE en funciones SECURITY DEFINER (reparación post ALTER OWNER).
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { DEFINER_FUNCTION_PRIVILEGE_CHECKS } from '../../scripts/historical-migration-grant-repair.js';
import { ensureAppPoolRoleVerified, getAppPool } from '../helpers/db.js';
import { expectPgError } from './pg-expect.js';

const migratorUrl = process.env.DATABASE_MIGRATION_URL;
const ARGON = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';

if (process.env.REQUIRE_DB_TESTS === '1' && !migratorUrl) {
  throw new Error('definer-privileges: DATABASE_MIGRATION_URL requerido');
}

describe.skipIf(!migratorUrl)('F0 — privilegios definer (P0)', () => {
  for (const spec of DEFINER_FUNCTION_PRIVILEGE_CHECKS) {
    it(`has_function_privilege ${spec.fn}`, async () => {
      const client = new pg.Client({ connectionString: migratorUrl! });
      await client.connect();
      try {
        for (const { role, execute } of spec.roles) {
          const { rows } = await client.query<{ ok: boolean }>(
            `select has_function_privilege($1, $2, 'EXECUTE') as ok`,
            [role, spec.fn],
          );
          expect(rows[0]!.ok, `${role} on ${spec.fn}`).toBe(execute);
        }
      } finally {
        await client.end();
      }
    });
  }

  it('T-SEC-30 fabsoft_app: bootstrap_first_admin denegado (42501), sin EXECUTE', async () => {
    if (!process.env.TEST_DATABASE_URL) return;
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local role fabsoft_app`);
      await client.query(
        `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
      );
      const { rows: before } = await client.query<{ n: number }>(
        `select count(*)::int as n from app.users where role = 'admin'`,
      );
      await expectPgError(
        client,
        'select app.bootstrap_first_admin($1,$2,$3)',
        ['x@t.co', 'X', ARGON],
        '42501',
      );
      const { rows: after } = await client.query<{ n: number }>(
        `select count(*)::int as n from app.users where role = 'admin'`,
      );
      expect(after[0]!.n).toBe(before[0]!.n);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});
