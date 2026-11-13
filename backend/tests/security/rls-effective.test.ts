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
      `insert into app.alert_rules (id, code, description, offset_days, channels) values
        ($1,'TSTRLS','RLS test',77,'{in_app}') on conflict (code) do update set id = excluded.id`,
      [ids.alertRule],
    );
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

  it('T-F0-08b event trigger según ruta (fresh vs upgrade)', async () => {
    const client = new pg.Client({ connectionString: migratorUrl! });
    await client.connect();
    try {
      const { rows } = await client.query<{ evtname: string }>(
        `select evtname from pg_event_trigger where evtname = 'fabsoft_enforce_rls'`,
      );
      const upgradeRoute = process.env.FABSOFT_EXPECT_EVENT_TRIGGER === '1';
      if (upgradeRoute) {
        expect(rows.map((r) => r.evtname)).toContain('fabsoft_enforce_rls');
      } else {
        expect(rows).toEqual([]);
      }
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

  it('T-F0-09c RLS efectivo fabsoft_app: aislamiento por tabla (dos alcances)', async () => {
    await asClientUser(async (c) => {
      const clientRows = await c.query<{ id: string }>(
        `select id from app.clients where id in ($1,$2) order by id`,
        [ids.clientA, ids.clientB],
      );
      expect(clientRows.rows.map((r) => r.id)).toEqual([ids.clientA]);

      // Base table subscriptions: SELECT fabsoft_app sólo staff (0002); portal usa fabsoft_secure_view (0004).
      expect((await c.query(`select id from app.subscriptions`)).rowCount).toBe(0);

      const renewal = await c.query<{ id: string }>(
        `select id from app.renewal_requests where id in ($1,$2)`,
        [ids.renewalA, ids.renewalB],
      );
      expect(renewal.rows.map((r) => r.id)).toEqual([ids.renewalA]);

      for (const table of ['client_contacts', 'client_notes', 'tasks', 'notifications'] as const) {
        const { rowCount } = await c.query(`select id from app.${table}`);
        expect(rowCount, `${table}: cliente no debe ver filas staff`).toBe(0);
      }

      const blocked = await c.query(`update app.renewal_requests set comment = 'hack' where id = $1`, [
        ids.renewalB,
      ]);
      expect(blocked.rowCount).toBe(0);
    });
  });

  it('T-F0-09c operador: suscripciones A/B visibles; cliente no filtra vía USING roto', async () => {
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
      const { rows } = await client.query<{ id: string }>(
        `select id from app.subscriptions where id in ($1,$2) order by id`,
        [ids.subA, ids.subB],
      );
      expect(rows.map((r) => r.id).sort()).toEqual([ids.subA, ids.subB].sort());
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
