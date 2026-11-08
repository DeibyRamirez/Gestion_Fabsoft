/**
 * Sprint1 F0: migrator conectado directamente (sin SET ROLE desde admin),
 * runtime sin DDL/escapación y sin fuga de contexto RLS en el pool.
 */
import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  assertMigratorBootstrapExpectation,
  loadSessionIdentity,
  probeSetRole,
} from '../../scripts/guard.js';
import { assertSameDatabaseInstallation, redactDatabaseUrl } from '../../scripts/database-url.js';
import { ensureAppPoolRoleVerified, getAppPool } from '../helpers/db.js';

const migratorUrl = process.env.DATABASE_MIGRATION_URL;
const provisionUrl = process.env.DATABASE_PROVISION_URL ?? process.env.TEST_DATABASE_MIGRATION_URL;
const appUrl = process.env.TEST_DATABASE_URL;

if (!migratorUrl && process.env.REQUIRE_DB_TESTS === '1') {
  throw new Error('DATABASE_MIGRATION_URL requerido para foundation F0');
}

const skip = !migratorUrl || !appUrl;

describe.skipIf(skip)('F0 — identidad migrator (LOGIN directo)', () => {
  it('migrator es LOGIN restringido, sin SET ROLE a owner ni ADMIN', async () => {
    const client = new pg.Client({ connectionString: migratorUrl });
    await client.connect();
    try {
      const id = await loadSessionIdentity((sql, params) => client.query(sql, params));
      assertMigratorBootstrapExpectation(id);
      expect(id.currentUser).toBe('fabsoft_migrator');
      expect(id.canSetRoleMigrator).toBe(true);
    } finally {
      await client.end();
    }
  });

  it('membresías transitivas sin ADMIN sobre roles de aplicación', async () => {
    const client = new pg.Client({ connectionString: migratorUrl });
    await client.connect();
    try {
      const id = await loadSessionIdentity((sql, params) => client.query(sql, params));
      expect(id.memberOf.some((r) => r.includes('fabsoft_app'))).toBe(true);
      expect(id.adminOf).toEqual([]);
    } finally {
      await client.end();
    }
  });

  it('provisioner y migrator misma instalación, usuarios distintos', () => {
    expect(provisionUrl).toBeTruthy();
    assertSameDatabaseInstallation(migratorUrl!, provisionUrl!);
    expect(redactDatabaseUrl(provisionUrl!)).not.toMatch(/:[^@/]+@/);
    expect(redactDatabaseUrl(migratorUrl!)).toContain('fabsoft_migrator@');
  });
});

describe.skipIf(skip)('F0 — runtime fabsoft_app', () => {
  afterAll(async () => {
    const pool = getAppPool();
    await pool.end();
  });

  it('acceso positivo a productos bajo contexto admin', async () => {
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.actor_type','user',true), set_config('app.actor_role','admin',true),
        set_config('app.current_user_id','00000000-0000-0000-0000-0000000000a1',true)`);
      const { rows } = await client.query('select count(*)::int as n from app.products');
      expect(rows[0]!.n).toBeGreaterThanOrEqual(0);
      const { rows: priv } = await client.query<{ rolcreaterole: boolean; rolsuper: boolean }>(
        `select rolcreaterole, rolsuper from pg_roles where rolname = session_user::name`,
      );
      expect(priv[0]!.rolsuper).toBe(false);
      expect(priv[0]!.rolcreaterole).toBe(false);
      await client.query('commit');
    } finally {
      client.release();
    }
  });

  it('deniega DDL, SET ROLE owner y SET ROLE worker', async () => {
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('savepoint ddl_try');
      await expect(client.query('create table app.evil_probe(id int)')).rejects.toBeTruthy();
      await client.query('rollback to savepoint ddl_try');
      const q = (sql: string) => client.query(sql);
      expect(await probeSetRole(q, 'fabsoft_owner')).toBe(false);
      expect(await probeSetRole(q, 'fabsoft_worker')).toBe(false);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('T-SEC-07 — sin contexto app.* tras commit ni tras rollback', async () => {
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.actor_type','user',true), set_config('app.actor_role','admin',true),
        set_config('app.current_user_id','00000000-0000-0000-0000-0000000000a1',true)`);
      await client.query('commit');
      let { rows } = await client.query(
        `select current_setting('app.actor_type', true) as t,
                current_setting('app.actor_role', true) as r`,
      );
      expect(rows[0]!.t).toBeFalsy();
      expect(rows[0]!.r).toBeFalsy();
      await client.query('begin');
      await client.query(`select set_config('app.actor_type','user',true)`);
      await client.query('rollback');
      ({ rows } = await client.query(
        `select current_setting('app.actor_type', true) as t`,
      ));
      expect(rows[0]!.t).toBeFalsy();
    } finally {
      client.release();
    }
  });

  it('segunda conexión del pool no hereda contexto de la primera', async () => {
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      await c1.query('begin');
      await c1.query(`select set_config('app.actor_role','admin',true)`);
      await c1.query('commit');
      const { rows } = await c2.query(
        `select current_setting('app.actor_role', true) as r`,
      );
      expect(rows[0]!.r).toBeFalsy();
    } finally {
      c1.release();
      c2.release();
    }
  });
});
