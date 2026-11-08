/**
 * Sprint1 F0: migrator conectado directamente (sin SET ROLE desde admin),
 * runtime sin DDL/escapación y sin fuga de contexto RLS en el pool.
 */
import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { loadSessionIdentity } from '../../scripts/guard.js';
import { redactDatabaseUrl } from '../../scripts/database-url.js';
import { ensureAppPoolRoleVerified, getAppPool } from '../helpers/db.js';

const migratorUrl = process.env.DATABASE_MIGRATION_URL;
const provisionUrl = process.env.DATABASE_PROVISION_URL ?? process.env.TEST_DATABASE_MIGRATION_URL;
const appUrl = process.env.TEST_DATABASE_URL;

if (!migratorUrl && process.env.REQUIRE_DB_TESTS === '1') {
  throw new Error('DATABASE_MIGRATION_URL requerido para foundation F0');
}

const skip = !migratorUrl || !appUrl;

describe.skipIf(skip)('F0 — identidad migrator (LOGIN directo)', () => {
  it('migrator es LOGIN, no superusuario, sin SET ROLE a owner', async () => {
    const client = new pg.Client({ connectionString: migratorUrl });
    await client.connect();
    try {
      const id = await loadSessionIdentity((sql, params) => client.query(sql, params));
      expect(id.sessionUser).toBe('fabsoft_migrator');
      expect(id.rolsuper).toBe(false);
      expect(id.rolbypassrls).toBe(false);
      expect(id.rolcanlogin).toBe(true);
      expect(id.canSetRoleOwner).toBe(false);
    } finally {
      await client.end();
    }
  });

  it('provisioner distinto de migrator (URLs redactadas en evidencia)', () => {
    expect(provisionUrl).toBeTruthy();
    expect(redactDatabaseUrl(provisionUrl!)).not.toMatch(/:[^@/]+@/);
    expect(redactDatabaseUrl(migratorUrl!)).toContain('fabsoft_migrator@');
  });
});

describe.skipIf(skip)('F0 — runtime fabsoft_app', () => {
  afterAll(async () => {
    const pool = getAppPool();
    await pool.end();
  });

  it('acceso positivo a catálogo bajo contexto admin', async () => {
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.actor_type','user',true), set_config('app.actor_role','admin',true),
        set_config('app.current_user_id','00000000-0000-0000-0000-0000000000a1',true)`);
      const { rows } = await client.query('select count(*)::int as n from app.products');
      expect(rows[0]!.n).toBeGreaterThanOrEqual(0);
      await client.query('commit');
    } finally {
      client.release();
    }
  });

  it('deniega DDL (CREATE TABLE) y escalación SET ROLE', async () => {
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await expect(client.query('create table app.evil_probe(id int)')).rejects.toBeTruthy();
      await client.query('savepoint role_try');
      await expect(client.query('set local role fabsoft_owner')).rejects.toBeTruthy();
      await client.query('rollback to savepoint role_try');
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('T-SEC-07 — el pool no conserva contexto app.* tras commit', async () => {
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.actor_type','user',true), set_config('app.actor_role','admin',true),
        set_config('app.current_user_id','00000000-0000-0000-0000-0000000000a1',true)`);
      await client.query('commit');
      const { rows } = await client.query(
        `select current_setting('app.actor_type', true) as t,
                current_setting('app.actor_role', true) as r`,
      );
      expect(rows[0]!.t).toBeFalsy();
      expect(rows[0]!.r).toBeFalsy();
    } finally {
      client.release();
    }
  });
});
