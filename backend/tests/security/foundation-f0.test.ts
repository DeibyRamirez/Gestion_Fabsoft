/**
 * Sprint1 F0 — migrator LOGIN directo, runtime sin escalación, paridad RLS.
 * Mapa IDs: docs/qa-f0-test-map.md
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  RUNTIME_LOGIN_ROLES,
  assertMigratorBootstrapExpectation,
  assertRuntimeRolesNotPrivileged,
  loadSessionIdentity,
} from '../../scripts/guard.js';
import { assertSameDatabaseInstallation, redactDatabaseUrl } from '../../scripts/database-url.js';
import { ensureAppPoolRoleVerified, getAppPool, migrationUrl } from '../helpers/db.js';
import { expectPgError } from './pg-expect.js';
import { SET_ROLE_TARGETS } from '../../scripts/migrator-historical-elevation.js';

const migratorUrl = process.env.DATABASE_MIGRATION_URL;
const provisionUrl = process.env.DATABASE_PROVISION_URL ?? process.env.TEST_DATABASE_MIGRATION_URL;
const appUrl = process.env.TEST_DATABASE_URL;

if (process.env.REQUIRE_DB_TESTS === '1') {
  const missing = [
    !migratorUrl && 'DATABASE_MIGRATION_URL',
    !provisionUrl && 'DATABASE_PROVISION_URL',
    !appUrl && 'TEST_DATABASE_URL',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`F0 security: faltan variables obligatorias en CI: ${missing.join(', ')}`);
  }
}

const ownerPool =
  migrationUrl && process.env.REQUIRE_DB_TESTS === '1'
    ? new pg.Pool({ connectionString: migrationUrl, max: 2 })
    : undefined;

const ids = {
  clientA: '00000000-0000-0000-0000-0000000000aa',
  clientB: '00000000-0000-0000-0000-0000000000ab',
  admin: '00000000-0000-0000-0000-0000000000a1',
  clientUserA: '00000000-0000-0000-0000-0000000000a3',
  product: '00000000-0000-0000-0000-0000000000f1',
  subA: '00000000-0000-0000-0000-0000000000c1',
  subB: '00000000-0000-0000-0000-0000000000c2',
};

beforeAll(async () => {
  if (!ownerPool) return;
  const c = await ownerPool.connect();
  try {
    await c.query('begin');
    await c.query(
      `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
    );
    await c.query(
      `insert into app.clients (id, legal_name) values ($1,'F0 A'),($2,'F0 B') on conflict do nothing`,
      [ids.clientA, ids.clientB],
    );
    await c.query(
      `insert into app.users (id, email, full_name, password_hash, role, client_id) values
        ($1,'f0-admin@t.co','Admin','h','admin',null),
        ($2,'f0-ca@t.co','Cli A','h','client',$3) on conflict do nothing`,
      [ids.admin, ids.clientUserA, ids.clientA],
    );
    await c.query(
      `insert into app.products (id, name, product_type) values ($1,'F0 Lic','third_party') on conflict do nothing`,
      [ids.product],
    );
    await c.query(
      `insert into app.subscriptions (id, client_id, product_id, start_date, current_period_end, billing_cycle,
         price_amount, supplier_cost_amount, status, visible_in_portal)
       values ($1,$2,$3,'2026-01-01','2026-12-31','annual',1,1,'active',true),
              ($4,$5,$3,'2026-01-01','2026-12-31','annual',2,2,'active',true) on conflict do nothing`,
      [ids.subA, ids.clientA, ids.product, ids.subB, ids.clientB],
    );
    await c.query('commit');
  } finally {
    c.release();
  }
});

afterAll(async () => {
  if (ownerPool) {
    await ownerPool
      .query(`delete from app.subscriptions where id in ($1,$2)`, [ids.subA, ids.subB])
      .catch(() => undefined);
    await ownerPool.end();
  }
  if (appUrl) {
    const pool = getAppPool();
    await pool.end();
  }
});

describe('F0 — migrator (LOGIN directo)', () => {
  it('T-F0-01 migrator restringido: sin superusuario/CREATEROLE/ADMIN', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const id = await loadSessionIdentity((sql, params) => client.query(sql, params));
      assertMigratorBootstrapExpectation(id);
      expect(id.currentUser).toBe('fabsoft_migrator');
    } finally {
      await client.end();
    }
  });

  it('T-F0-03 migrator deniega escalación (42501)', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      await client.query('begin');
      for (const role of SET_ROLE_TARGETS) {
        await expectPgError(client, `set local role ${role}`, [], '42501');
      }
      await expectPgError(client, 'grant fabsoft_auth_definer to fabsoft_app', [], '42501');
      await expectPgError(client, `create role f0_evil nologin`, [], '42501');
      await expectPgError(client, 'set local role fabsoft_owner', [], '42501');
      await client.query('rollback');
    } finally {
      await client.end();
    }
  });

  it('T-F0-11 cierre efímero: migrator sin membresías SET/ADMIN en pg_auth_members', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{
        granted_role: string;
        admin_option: boolean;
        set_option: boolean;
      }>(
        `select granted.rolname::text as granted_role, m.admin_option, m.set_option
         from pg_catalog.pg_auth_members m
         join pg_catalog.pg_roles member on member.oid = m.member
         join pg_catalog.pg_roles granted on granted.oid = m.roleid
         where member.rolname = 'fabsoft_migrator'`,
      );
      expect(rows).toEqual([]);
    } finally {
      await client.end();
    }
  });

  it('T-F0-12 inventario post-migración: owners ACL y app→worker vigente', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const fnOwner = async (name: string) => {
        const { rows } = await client.query<{ owner: string }>(
          `select pg_catalog.pg_get_userbyid(p.proowner)::text as owner
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'app' and p.proname = $1 limit 1`,
          [name],
        );
        return rows[0]?.owner;
      };
      const relOwner = async (name: string) => {
        const { rows } = await client.query<{ owner: string }>(
          `select pg_catalog.pg_get_userbyid(c.relowner)::text as owner
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'app' and c.relname = $1 limit 1`,
          [name],
        );
        return rows[0]?.owner;
      };
      expect(await fnOwner('auth_password_hash')).toBe('fabsoft_secure_view');
      expect(await fnOwner('bootstrap_first_admin')).toBe('fabsoft_auth_definer');
      expect(await relOwner('portal_subscriptions')).toBe('fabsoft_secure_view');
      const { rows: ns } = await client.query<{ owner: string }>(
        `select pg_catalog.pg_get_userbyid(nspowner)::text as owner
         from pg_namespace where nspname = 'pgboss'`,
      );
      expect(ns[0]?.owner).toBe('fabsoft_worker');
      const { rows: workerMember } = await client.query<{ roleid: string }>(
        `select roleid::regrole::text as roleid from pg_auth_members m
         join pg_roles r on r.oid = m.member where r.rolname = 'fabsoft_worker'`,
      );
      expect(workerMember.map((r) => r.roleid)).toContain('fabsoft_app');
      const { rows: defAcl } = await client.query<{ defaclrole: string }>(
        `select pg_catalog.pg_get_userbyid(d.defaclrole)::text as defaclrole
         from pg_default_acl d
         join pg_namespace n on n.oid = d.defaclnamespace
         where n.nspname = 'app' limit 1`,
      );
      expect(defAcl.length).toBeGreaterThan(0);
    } finally {
      await client.end();
    }
  });

  it('T-F0-04 provisioner y migrator misma instalación (usuarios distintos)', () => {
    assertSameDatabaseInstallation(migratorUrl!, provisionUrl!);
    expect(redactDatabaseUrl(provisionUrl!)).not.toMatch(/:[^@/]+@/);
    expect(parseTargetUser(migratorUrl!)).toBe('fabsoft_migrator');
    expect(parseTargetUser(provisionUrl!)).not.toBe('fabsoft_migrator');
  });
});

describe('F0 — harness y roles efectivos', () => {
  it('T-F0-05 procedencia efímera en base principal', async () => {
    const runId = process.env.SEED_HARNESS_RUN_ID;
    expect(runId).toBeTruthy();
    const client = new pg.Client({ connectionString: provisionUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{ run_id: string; marker: string }>(
        `select run_id, marker from fabsoft_harness.ephemeral_provenance where run_id = $1`,
        [runId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.marker).toBe(process.env.SEED_EPHEMERAL_MARKER);
    } finally {
      await client.end();
    }
  });

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
});

describe('F0 — runtime fabsoft_app', () => {
  it('T-F0-06 acceso positivo a productos bajo contexto admin', async () => {
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.actor_type','user',true), set_config('app.actor_role','admin',true),
        set_config('app.current_user_id','${ids.admin}',true)`);
      const { rows } = await client.query<{ n: number }>(
        'select count(*)::int as n from app.products',
      );
      expect(rows[0]!.n).toBeGreaterThanOrEqual(1);
      await client.query('commit');
    } finally {
      client.release();
    }
  });

  it('T-F0-07 contexto app.* no persiste tras commit/rollback/pool', async () => {
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      await c1.query('begin');
      await c1.query(`select set_config('app.actor_role','admin',true)`);
      await c1.query('commit');
      expect(
        (await c1.query(`select current_setting('app.actor_role', true) as r`)).rows[0]!.r,
      ).toBeFalsy();
      await c2.query('begin');
      await c2.query(`select set_config('app.actor_role','operator',true)`);
      await c2.query('rollback');
      expect(
        (await c2.query(`select current_setting('app.actor_role', true) as r`)).rows[0]!.r,
      ).toBeFalsy();
      c1.release();
      const c3 = await pool.connect();
      try {
        await c3.query('begin');
        expect(
          (await c3.query(`select current_setting('app.actor_role', true) as r`)).rows[0]!.r,
        ).toBeFalsy();
        await c3.query('rollback');
      } finally {
        c3.release();
      }
    } finally {
      c2.release();
    }
  });

  it('T-F0-08 RLS: 18 tablas app con ENABLE+FORCE y políticas', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const { rows } = await client.query('select * from app.rls_inventory()');
      expect(rows.length).toBe(18);
      const bad = rows.filter(
        (r) => !r.rls_enabled || !r.rls_forced || (r.policy_count as number) < 1,
      );
      expect(bad, JSON.stringify(bad)).toEqual([]);
    } finally {
      await client.end();
    }
  });

  it('T-F0-09 aislamiento A/B: cliente A no lee ni escribe filas del cliente B', async () => {
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local role fabsoft_app`);
      await client.query(
        `select set_config('app.actor_type','user',true), set_config('app.actor_role','client',true),
                set_config('app.current_user_id',$1,true), set_config('app.client_id',$2,true)`,
        [ids.clientUserA, ids.clientA],
      );
      const { rows } = await client.query<{ id: string }>(
        `select id from app.clients where id in ($1,$2)`,
        [ids.clientA, ids.clientB],
      );
      expect(rows.map((r) => r.id)).toEqual([ids.clientA]);
      await expectPgError(
        client,
        `insert into app.clients (id, legal_name) values ($1,'Evil')`,
        [ids.clientB],
        '42501',
      );
      await expectPgError(
        client,
        `update app.clients set legal_name = 'Hack' where id = $1`,
        [ids.clientB],
        '42501',
      );
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

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

  it('runtime deniega DDL y SET ROLE owner (42501)', async () => {
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

function parseTargetUser(url: string): string {
  return decodeURIComponent(new URL(url).username);
}
