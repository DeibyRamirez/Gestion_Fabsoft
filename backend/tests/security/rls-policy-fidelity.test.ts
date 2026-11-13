/**
 * T-F0-09 / PO R10: pg_policies app = snapshot develop (64/62 políticas exactas).
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { migrationUrl } from '../helpers/db.js';
import {
  assertAppPoliciesMatchDevelopSnapshot,
  assertDatabaseAppPoliciesFidelity,
  fetchAppSchemaPolicies,
  loadDevelopPolicySnapshot,
} from './rls-migration-policy-fidelity.js';

const url = migrationUrl;

if (process.env.REQUIRE_DB_TESTS === '1' && !url) {
  throw new Error('rls-policy-fidelity: DATABASE_MIGRATION_URL requerido');
}

describe.skipIf(!url)('RLS — fidelidad exacta a develop (app)', () => {
  it('pg_policies coincide con snapshot develop (qual, with_check, cmd, roles, permissive)', async () => {
    const snap = loadDevelopPolicySnapshot();
    expect(snap.policyCount).toBeGreaterThan(0);
    const c = new pg.Client({ connectionString: url! });
    await c.connect();
    try {
      await assertDatabaseAppPoliciesFidelity(c);
    } finally {
      await c.end();
    }
  });

  it('regresión: subscriptions_select USING (false OR true) rompe fidelidad', async () => {
    const c = new pg.Client({ connectionString: url! });
    await c.connect();
    try {
      await c.query('begin');
      await c.query(
        `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
      );
      await c.query(`drop policy if exists subscriptions_select on app.subscriptions`);
      await c.query(
        `create policy subscriptions_select on app.subscriptions for select to fabsoft_app using (false OR true)`,
      );
      const live = await fetchAppSchemaPolicies(c);
      expect(() => assertAppPoliciesMatchDevelopSnapshot(live)).toThrow(/no coincide|falta política|qual/);
      await c.query('rollback');
    } finally {
      await c.end();
    }
  });

  it('regresión: política permisiva extra rompe fidelidad', async () => {
    const c = new pg.Client({ connectionString: url! });
    await c.connect();
    try {
      await c.query('begin');
      await c.query(
        `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
      );
      await c.query(
        `create policy regress_extra_permissive on app.tasks for select to fabsoft_app using (true)`,
      );
      const live = await fetchAppSchemaPolicies(c);
      expect(() => assertAppPoliciesMatchDevelopSnapshot(live)).toThrow(/conteo|extra/);
      await c.query('rollback');
    } finally {
      await c.end();
    }
  });
});
