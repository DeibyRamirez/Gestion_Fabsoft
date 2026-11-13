/**
 * P0 — EXECUTE en funciones SECURITY DEFINER (reparación post ALTER OWNER).
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { DEFINER_FUNCTION_PRIVILEGE_CHECKS } from '../../scripts/historical-migration-grant-repair.js';
import { ensureAppPoolRoleVerified, getAppPool } from '../helpers/db.js';

const migratorUrl = process.env.DATABASE_MIGRATION_URL;
const ownerUrl = process.env.TEST_DATABASE_MIGRATION_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const ARGON = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';

if (process.env.REQUIRE_DB_TESTS === '1' && !migratorUrl) {
  throw new Error('definer-privileges: DATABASE_MIGRATION_URL requerido');
}

async function expectBootstrapDenied(
  c: pg.PoolClient,
  label: string,
): Promise<void> {
  await c.query('savepoint t_sec_30');
  try {
    await c.query('select app.bootstrap_first_admin($1,$2,$3)', ['x@t.co', 'X', ARGON]);
    throw new Error(`${label}: bootstrap_first_admin no debió ejecutarse`);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    expect(e.code, label).toBe('42501');
    expect(String(e.message), label).toMatch(/permission denied for function bootstrap_first_admin/i);
  }
  await c.query('rollback to savepoint t_sec_30');
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

  describe('T-SEC-30 fabsoft_app sin EXECUTE bootstrap (sin admin activo)', () => {
    const restoreAdminId = '00000000-0000-4000-8ff0-0000000000a1';

    async function withoutAdmin<T>(fn: () => Promise<T>): Promise<T> {
      if (!ownerUrl) throw new Error('TEST_DATABASE_MIGRATION_URL requerido');
      const owner = new pg.Client({ connectionString: ownerUrl });
      await owner.connect();
      try {
        await owner.query('begin');
        await owner.query(`set local session_replication_role = replica`);
        await owner.query(`delete from app.users where role = 'admin'`);
        await owner.query(`set local session_replication_role = origin`);
        await owner.query('commit');
        return await fn();
      } finally {
        try {
          await owner.query('begin');
          await owner.query(`set local session_replication_role = replica`);
          await owner.query(
            `insert into app.users (id, email, full_name, password_hash, role, client_id, status)
             values ($1,'sec-admin-restore@t.co','Admin','hash-admin','admin',null,'active')
             on conflict (id) do update set role = excluded.role, status = excluded.status`,
            [restoreAdminId],
          );
          await owner.query(`set local session_replication_role = origin`);
          await owner.query('commit');
        } catch {
          await owner.query('rollback').catch(() => undefined);
        }
        await owner.end();
      }
    }

    it.skipIf(!appUrl || !ownerUrl)('contexto admin', async () => {
      await withoutAdmin(async () => {
        await ensureAppPoolRoleVerified();
        const pool = getAppPool();
        const client = await pool.connect();
        try {
          await client.query('begin');
          await client.query(`set local role fabsoft_app`);
          await client.query(
            `select set_config('app.actor_type','user',true), set_config('app.actor_role','admin',true),
                    set_config('app.current_user_id',$1,true)`,
            [restoreAdminId],
          );
          await expectBootstrapDenied(client, 'admin');
          const { rows: after } = await client.query<{ n: number }>(
            `select count(*)::int as n from app.users where role = 'admin'`,
          );
          expect(after[0]!.n).toBe(0);
          await client.query('rollback');
        } finally {
          client.release();
        }
      });
    });

    it.skipIf(!appUrl || !ownerUrl)('contexto system', async () => {
      await withoutAdmin(async () => {
        await ensureAppPoolRoleVerified();
        const pool = getAppPool();
        const client = await pool.connect();
        try {
          await client.query('begin');
          await client.query(`set local role fabsoft_app`);
          await client.query(
            `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
          );
          await expectBootstrapDenied(client, 'system');
          await client.query('rollback');
        } finally {
          client.release();
        }
      });
    });

    it.skipIf(!appUrl || !ownerUrl)('contexto cliente A', async () => {
      await withoutAdmin(async () => {
        await ensureAppPoolRoleVerified();
        const pool = getAppPool();
        const client = await pool.connect();
        try {
          await client.query('begin');
          await client.query(`set local role fabsoft_app`);
          await client.query(
            `select set_config('app.actor_type','user',true), set_config('app.actor_role','client',true),
                    set_config('app.current_user_id',$1,true), set_config('app.client_id',$2,true)`,
            ['00000000-0000-4000-8ff0-0000000000a3', '00000000-0000-4000-8ff0-000000000001'],
          );
          await expectBootstrapDenied(client, 'cliente');
          await client.query('rollback');
        } finally {
          client.release();
        }
      });
    });
  });

  it('mutación repair: fabsoft_app sin EXECUTE sobre bootstrap_first_admin (repair activo)', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{ ok: boolean }>(
        `select has_function_privilege('fabsoft_app', 'app.bootstrap_first_admin(text,text,text)', 'EXECUTE') as ok`,
      );
      expect(rows[0]!.ok).toBe(false);
    } finally {
      await client.end();
    }
  });
});
