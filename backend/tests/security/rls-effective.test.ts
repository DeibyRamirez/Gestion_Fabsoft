/**
 * T-F0-06 … T-F0-09 + asimetría event trigger (mapa QA).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ensureAppPoolRoleVerified, getAppPool, migrationUrl } from '../helpers/db.js';
import { expectPgError } from './pg-expect.js';

const migratorUrl = process.env.DATABASE_MIGRATION_URL;
const appUrl = process.env.TEST_DATABASE_URL;

if (process.env.REQUIRE_DB_TESTS === '1') {
  const missing = [!migratorUrl && 'DATABASE_MIGRATION_URL', !appUrl && 'TEST_DATABASE_URL'].filter(
    Boolean,
  );
  if (missing.length) throw new Error(`rls-effective: faltan ${missing.join(', ')}`);
}

const ids = {
  clientA: '00000000-0000-4000-8ff0-000000000001',
  clientB: '00000000-0000-4000-8ff0-000000000002',
  admin: '00000000-0000-4000-8ff0-0000000000a1',
  clientUserA: '00000000-0000-4000-8ff0-0000000000a3',
  product: '00000000-0000-4000-8ff0-0000000000f1',
  subA: '00000000-0000-4000-8ff0-000000000f01',
  subB: '00000000-0000-4000-8ff0-000000000f02',
};

const ownerPool =
  migrationUrl && process.env.REQUIRE_DB_TESTS === '1'
    ? new pg.Pool({ connectionString: migrationUrl, max: 2 })
    : undefined;

beforeAll(async () => {
  if (!ownerPool) return;
  const c = await ownerPool.connect();
  try {
    await c.query('begin');
    await c.query(
      `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
    );
    await c.query(
      `insert into app.clients (id, legal_name) values ($1,'RLS A'),($2,'RLS B') on conflict do nothing`,
      [ids.clientA, ids.clientB],
    );
    await c.query(
      `insert into app.users (id, email, full_name, password_hash, role, client_id) values
        ($1,'rls-admin@t.co','Admin','h','admin',null),
        ($2,'rls-ca@t.co','Cli','h','client',$3) on conflict do nothing`,
      [ids.admin, ids.clientUserA, ids.clientA],
    );
    await c.query(
      `insert into app.products (id, name, product_type) values ($1,'RLS Lic','third_party') on conflict do nothing`,
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
  if (appUrl) await getAppPool().end();
});

describe.skipIf(!appUrl)('F0 — runtime fabsoft_app (RLS efectivo)', () => {
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
});

describe.skipIf(!migratorUrl)('F0 — inventario RLS (T-F0-08)', () => {
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

  it('T-F0-08b CI fresh: sin event trigger fabsoft_enforce_rls (migrator no super)', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{ evtname: string }>(
        `select evtname from pg_event_trigger where evtname = 'fabsoft_enforce_rls'`,
      );
      expect(rows, 'única asimetría permitida es upgrade superusuario (harness foundation)').toEqual(
        [],
      );
    } finally {
      await client.end();
    }
  });
});

describe.skipIf(!appUrl)('F0 — aislamiento (T-F0-09)', () => {
  it('T-F0-09b cada tabla app tiene ENABLE+FORCE y al menos una política', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{ n: number; bad: number }>(
        `select count(*)::int as n,
                count(*) filter (where not rls_enabled or not rls_forced or policy_count < 1)::int as bad
         from app.rls_inventory()`,
      );
      expect(rows[0]!.n).toBe(18);
      expect(rows[0]!.bad).toBe(0);
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
      const upd = await client.query(`update app.clients set legal_name = 'Hack' where id = $1`, [
        ids.clientB,
      ]);
      expect(upd.rowCount).toBe(0);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});
