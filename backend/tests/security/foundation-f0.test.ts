/**
 * Sprint1 F0 — migrator LOGIN directo, runtime sin escalación, paridad RLS.
 * Mapa IDs: docs/qa-f0-test-map.md
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { assertMigratorBootstrapExpectation, loadSessionIdentity } from '../../scripts/guard.js';
import { assertSameDatabaseInstallation, redactDatabaseUrl } from '../../scripts/database-url.js';
import { expectPgError } from './pg-expect.js';
import {
  MIGRATOR_MEMBERSHIP_CLOSURE_SQL,
  SET_ROLE_TARGETS,
} from '../../scripts/migrator-historical-elevation.js';

const migratorUrl = process.env.DATABASE_MIGRATION_URL;
const provisionUrl = process.env.DATABASE_PROVISION_URL ?? process.env.TEST_DATABASE_MIGRATION_URL;
if (process.env.REQUIRE_DB_TESTS === '1') {
  const missing = [
    !migratorUrl && 'DATABASE_MIGRATION_URL',
    !provisionUrl && 'DATABASE_PROVISION_URL',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`F0 security: faltan variables obligatorias en CI: ${missing.join(', ')}`);
  }
}

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

  it('T-F0-11 cierre efímero: migrator sin membresías (CTE recursivo)', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{
        granted_role: string;
        admin_option: boolean;
        set_option: boolean;
        inherit_option: boolean;
      }>(MIGRATOR_MEMBERSHIP_CLOSURE_SQL, ['fabsoft_migrator']);
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

describe('F0 — harness', () => {
  it('T-F0-05 procedencia efímera en base principal', async () => {
    const runId = process.env.SEED_HARNESS_RUN_ID ?? process.env.FABSOFT_HARNESS_RUN_ID;
    const marker = process.env.SEED_EPHEMERAL_MARKER;
    expect(runId).toBeTruthy();
    expect(marker).toBeTruthy();
    const client = new pg.Client({ connectionString: provisionUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{ run_id: string; marker: string }>(
        `select run_id, marker from fabsoft_harness.ephemeral_provenance where run_id = $1`,
        [runId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.marker).toBe(marker);
    } finally {
      await client.end();
    }
  });
});

function parseTargetUser(url: string): string {
  return decodeURIComponent(new URL(url).username);
}
