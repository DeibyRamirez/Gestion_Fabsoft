/**
 * T-F0-06 … T-F0-09 + asimetría event trigger (mapa QA).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ensureAppPoolRoleVerified, getAppPool, migrationUrl } from '../helpers/db.js';
import {
  APP_RLS_TABLES,
  assertClientIsolationNoLeak,
  type RlsFixtureIds,
} from './rls-isolation-checks.js';
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
  clientUserB: '00000000-0000-4000-8ff0-0000000000b3',
  product: '00000000-0000-4000-8ff0-0000000000f1',
  subA: '00000000-0000-4000-8ff0-000000000f01',
  subB: '00000000-0000-4000-8ff0-000000000f02',
  periodA: '00000000-0000-4000-8ff0-00000000a101',
  periodB: '00000000-0000-4000-8ff0-00000000a102',
  contactA: '00000000-0000-4000-8ff0-00000000c001',
  contactB: '00000000-0000-4000-8ff0-00000000c002',
  noteA: '00000000-0000-4000-8ff0-00000000b301',
  noteB: '00000000-0000-4000-8ff0-00000000b302',
  taskA: '00000000-0000-4000-8ff0-00000000b401',
  taskB: '00000000-0000-4000-8ff0-00000000b402',
  notifA: '00000000-0000-4000-8ff0-00000000b501',
  notifB: '00000000-0000-4000-8ff0-00000000b502',
  renewalA: '00000000-0000-4000-8ff0-00000000b601',
  renewalB: '00000000-0000-4000-8ff0-00000000b602',
  alertRule: '00000000-0000-4000-8ff0-00000000b701',
};

const harnessProvisionerUrl =
  process.env.DATABASE_PROVISION_URL ?? migrationUrl;
const ownerPool =
  harnessProvisionerUrl && process.env.REQUIRE_DB_TESTS === '1'
    ? new pg.Pool({ connectionString: harnessProvisionerUrl, max: 2 })
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
        ($2,'rls-ca@t.co','Cli A','h','client',$3),
        ($4,'rls-cb@t.co','Cli B','h','client',$5) on conflict do nothing`,
      [ids.admin, ids.clientUserA, ids.clientA, ids.clientUserB, ids.clientB],
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
    await c.query(
      `insert into app.subscription_periods (id, subscription_id, period_number, start_date, end_date, billing_cycle,
         price_amount, supplier_cost_amount)
       select $1,$2,1,'2026-01-01','2026-12-31','annual',1,1
       where not exists (select 1 from app.subscription_periods p where p.subscription_id = $2 and p.period_number = 1)`,
      [ids.periodA, ids.subA],
    );
    await c.query(
      `insert into app.subscription_periods (id, subscription_id, period_number, start_date, end_date, billing_cycle,
         price_amount, supplier_cost_amount)
       select $1,$2,1,'2026-01-01','2026-12-31','annual',2,2
       where not exists (select 1 from app.subscription_periods p where p.subscription_id = $2 and p.period_number = 1)`,
      [ids.periodB, ids.subB],
    );
    await c.query(
      `insert into app.client_contacts (id, client_id, full_name, email) values
        ($1,$2,'Contact A','contact-a@fabsoft.test'),($3,$4,'Contact B','contact-b@fabsoft.test') on conflict do nothing`,
      [ids.contactA, ids.clientA, ids.contactB, ids.clientB],
    );
    await c.query(
      `insert into app.client_notes (id, client_id, author_user_id, body) values
        ($1,$2,$3,'Note A'),($4,$5,$3,'Note B') on conflict do nothing`,
      [ids.noteA, ids.clientA, ids.admin, ids.noteB, ids.clientB],
    );
    await c.query(
      `insert into app.tasks (id, task_type, client_id, title, due_date, status, assignee_user_id) values
        ($1,'contact_client',$2,'Task A','2026-12-31','pending',$3),
        ($4,'contact_client',$5,'Task B','2026-12-31','pending',$3) on conflict do nothing`,
      [ids.taskA, ids.clientA, ids.admin, ids.taskB, ids.clientB],
    );
    await c.query(
      `insert into app.alert_rules (id, code, description, offset_days, channels)
       select $1,'TSTRLS','RLS test', coalesce(max(offset_days),0)+1, '{in_app}'
       from app.alert_rules
       on conflict (code) do nothing`,
      [ids.alertRule],
    );
    const ruleRow = await c.query<{ id: string }>(
      `select id from app.alert_rules where code = 'TSTRLS' limit 1`,
    );
    if (ruleRow.rows[0]) ids.alertRule = ruleRow.rows[0].id;
    await c.query(
      `insert into app.notifications (id, notification_type, channel, recipient_user_id, scheduled_for, subscription_id, period_end, alert_rule_id, dedupe_key) values
        ($1,'expiration_alert','in_app',$2,now(),$3,'2026-12-31',$7,'exp:$3:TSTRLS:2026-12-31:in_app:$2'),
        ($4,'expiration_alert','in_app',$5,now(),$6,'2026-12-31',$7,'exp:$6:TSTRLS:2026-12-31:in_app:$5') on conflict do nothing`,
      [ids.notifA, ids.admin, ids.subA, ids.notifB, ids.clientUserB, ids.subB, ids.alertRule],
    );
    await c.query(
      `insert into app.renewal_requests (id, subscription_id, client_id, requested_by_user_id, status)
       values ($1,$2,$3,$4,'pending_review'),($5,$6,$7,$8,'pending_review') on conflict do nothing`,
      [ids.renewalA, ids.subA, ids.clientA, ids.clientUserA, ids.renewalB, ids.subB, ids.clientB, ids.clientUserB],
    );
    await c.query('commit');
  } finally {
    c.release();
  }
});

afterAll(async () => {
  if (ownerPool) await ownerPool.end();
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

  it('T-F0-08b fresh: sin event trigger fabsoft_enforce_rls', async () => {
    if (process.env.FABSOFT_EXPECT_EVENT_TRIGGER === '1') return;
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{ evtname: string }>(
        `select evtname from pg_event_trigger where evtname = 'fabsoft_enforce_rls'`,
      );
      expect(rows).toEqual([]);
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

  async function asClientUser<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
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
      const out = await fn(client);
      await client.query('rollback');
      return out;
    } finally {
      client.release();
    }
  }

  const matrixIds: RlsFixtureIds = ids;

  it('T-F0-09c sin contexto: fabsoft_app no ve filas en tablas app', async () => {
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local role fabsoft_app`);
      for (const table of APP_RLS_TABLES) {
        expect((await client.query(`select count(*)::int as n from app.${table}`)).rows[0]!.n).toBe(
          0,
        );
      }
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('T-F0-09c cliente A: portal + 18 tablas según matriz', async () => {
    await asClientUser(async (c) => {
      await assertClientIsolationNoLeak(c, matrixIds);

      const users = await c.query<{ id: string }>(`select id from app.users`);
      expect(users.rows.map((r) => r.id)).toEqual([ids.clientUserA]);

      expect((await c.query(`select id from app.subscription_periods`)).rowCount).toBe(0);
      const portalPeriods = await c.query(`select id from app.portal_subscription_periods`);
      expect(portalPeriods.rowCount).toBeGreaterThanOrEqual(1);

      expect((await c.query(`select id from app.products`)).rowCount).toBeGreaterThanOrEqual(1);

      for (const table of [
        'refresh_tokens',
        'client_contacts',
        'client_notes',
        'tasks',
        'notifications',
        'alert_rules',
        'integrations',
        'integration_clients',
        'api_credentials',
        'idempotency_keys',
        'audit_logs',
      ] as const) {
        const { rows } = await c.query<{ n: number }>(`select count(*)::int as n from app.${table}`);
        expect(rows[0]!.n, table).toBe(0);
      }
      const settings = await c.query<{ key: string }>(
        `select key from app.app_settings order by key`,
      );
      expect(settings.rowCount).toBe(1);
      expect(settings.rows[0]!.key).toBe('contact_channel');

      await expectPgError(
        c,
        `insert into app.clients (id, legal_name) values ($1,'X')`,
        [ids.clientB],
        '42501',
      );
      await expectPgError(
        c,
        `insert into app.renewal_requests (subscription_id, client_id, requested_by_user_id, status)
         values ($1,$2,$3,'pending_review')`,
        [ids.subB, ids.clientB, ids.clientUserA],
        '42501',
      );
      await expectPgError(c, `delete from app.clients where id = $1`, [ids.clientB], '42501');
    });
  });

  it('T-F0-09c staff operador: tablas de negocio visibles A/B', async () => {
    await ensureAppPoolRoleVerified();
    const pool = getAppPool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local role fabsoft_app`);
      await client.query(
        `select set_config('app.actor_type','user',true), set_config('app.actor_role','operator',true),
                set_config('app.current_user_id',$1,true)`,
        [ids.admin],
      );
      const subs = await client.query<{ id: string }>(
        `select id from app.subscriptions where id in ($1,$2)`,
        [ids.subA, ids.subB],
      );
      expect(subs.rowCount).toBe(2);
      const contacts = await client.query(`select id from app.client_contacts`);
      expect(contacts.rowCount).toBeGreaterThanOrEqual(1);
      const tasks = await client.query(`select id from app.tasks`);
      expect(tasks.rowCount).toBeGreaterThanOrEqual(1);
      const wrote = await client.query(
        `update app.subscriptions set renewal_terms = 'operador-qa' where id = $1 returning id`,
        [ids.subA],
      );
      expect(wrote.rowCount).toBe(1);
      await client.query('rollback');
    } finally {
      client.release();
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
