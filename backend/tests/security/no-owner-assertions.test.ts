/**
 * T-F0-10 y 42501 explícitos — sin owner bootstrap en app; worker sin DDL (P0).
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { ensureAppPoolRoleVerified, getAppPool } from '../helpers/db.js';
import { expectPgError } from './pg-expect.js';

const migratorUrl = process.env.DATABASE_MIGRATION_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;

if (process.env.REQUIRE_DB_TESTS === '1' && !migratorUrl) {
  throw new Error('no-owner-assertions: DATABASE_MIGRATION_URL requerido');
}

describe.skipIf(!migratorUrl)('F0 — inventario sin fabsoft_owner (T-F0-10)', () => {
  it('T-F0-10 tablas app sin owner fabsoft_owner', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{ tablename: string; owner: string }>(
        `select c.relname as tablename, pg_catalog.pg_get_userbyid(c.relowner)::text as owner
         from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'app' and c.relkind = 'r'
         order by 1`,
      );
      expect(rows.length).toBeGreaterThan(0);
      const ownedByBootstrap = rows.filter((r) => r.owner === 'fabsoft_owner');
      expect(ownedByBootstrap, JSON.stringify(ownedByBootstrap)).toEqual([]);
    } finally {
      await client.end();
    }
  });

  it('T-F0-10b fabsoft_worker sin CREATE en schema app (has_schema_privilege)', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      for (const role of ['fabsoft_worker', 'fabsoft_secure_view', 'fabsoft_auth_definer'] as const) {
        const { rows } = await client.query<{ ok: boolean }>(
          `select has_schema_privilege($1, 'app', 'CREATE') as ok`,
          [role],
        );
        expect(rows[0]!.ok, role).toBe(false);
      }
    } finally {
      await client.end();
    }
  });

  it('T-F0-10c worker sin DDL: CREATE TABLE y CREATE FUNCTION (42501)', async () => {
    if (!workerUrl && process.env.REQUIRE_DB_TESTS === '1') {
      throw new Error('WORKER_DATABASE_URL requerido para T-F0-10c');
    }
    if (!workerUrl) return;
    const client = new pg.Client({ connectionString: workerUrl });
    await client.connect();
    try {
      await client.query('begin');
      await client.query('set local role fabsoft_worker');
      await expectPgError(client, 'create table app.zz_worker_ddl_regress(id int)', [], '42501');
      await expectPgError(
        client,
        `create function app.zz_worker_fn_regress() returns int language sql as $$ select 1 $$`,
        [],
        '42501',
      );
      await client.query('rollback');
    } finally {
      await client.end();
    }
  });

  it('T-F0-10d fresh: ningún objeto app owned by fabsoft_owner', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{ kind: string; name: string }>(
        `select c.relkind::text as kind, c.relname::text as name
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'app' and pg_catalog.pg_get_userbyid(c.relowner)::text = 'fabsoft_owner'
         union all
         select 'function', p.proname::text
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'app' and pg_catalog.pg_get_userbyid(p.proowner)::text = 'fabsoft_owner'`,
      );
      expect(rows, JSON.stringify(rows)).toEqual([]);
    } finally {
      await client.end();
    }
  });

  it('runtime fabsoft_app deniega DDL y SET ROLE owner (42501)', async () => {
  if (!process.env.TEST_DATABASE_URL) return;
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await expectPgError(client, 'create table app.f0_evil(id int)', [], '42501');
      await expectPgError(client, 'set local role fabsoft_owner', [], '42501');
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});
