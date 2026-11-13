/**
 * T-F0-09 / PO: las políticas en BD deben ser las de las migraciones (sin restore en beforeAll).
 */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { migrationUrl } from '../helpers/db.js';
import {
  assertDatabaseFabsoftAppPoliciesFidelity,
  assertFabsoftAppPoliciesMatchMigrations,
  fetchFabsoftAppSelectQuals,
} from './rls-migration-policy-fidelity.js';

const url = migrationUrl;

if (process.env.REQUIRE_DB_TESTS === '1' && !url) {
  throw new Error('rls-policy-fidelity: DATABASE_MIGRATION_URL requerido');
}

describe.skipIf(!url)('RLS — fidelidad a migraciones (fabsoft_app)', () => {
  it('políticas SELECT fabsoft_app coinciden con 0003/0004 (sin reescritura en harness)', async () => {
    const c = new pg.Client({ connectionString: url! });
    await c.connect();
    try {
      await assertDatabaseFabsoftAppPoliciesFidelity(c);
    } finally {
      await c.end();
    }
  });

  it('regresión: subscriptions_select USING(true) rompe fidelidad', async () => {
    const c = new pg.Client({ connectionString: url! });
    await c.connect();
    try {
      await c.query('begin');
      await c.query(
        `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
      );
      await c.query(`drop policy if exists subscriptions_select on app.subscriptions`);
      await c.query(
        `create policy subscriptions_select on app.subscriptions for select to fabsoft_app using (true)`,
      );
      const quals = await fetchFabsoftAppSelectQuals(c);
      expect(() => assertFabsoftAppPoliciesMatchMigrations(quals)).toThrow(/corrupta|falta fragmento/i);
      await c.query('rollback');
    } finally {
      await c.end();
    }
  });
});
