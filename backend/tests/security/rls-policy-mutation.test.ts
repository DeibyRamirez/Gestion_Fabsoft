/**
 * Validación PO: corrupt policy USING(true) debe poner T-F0-09c en rojo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ensureAppPoolRoleVerified, getAppPool, migrationUrl } from '../helpers/db.js';

const ownerUrl = migrationUrl;
const appUrl = process.env.TEST_DATABASE_URL;

if (process.env.REQUIRE_DB_TESTS === '1' && (!ownerUrl || !appUrl)) {
  throw new Error('rls-policy-mutation: URLs requeridas');
}

const ids = {
  clientA: '00000000-0000-4000-8ff0-000000000001',
  clientB: '00000000-0000-4000-8ff0-000000000002',
  clientUserA: '00000000-0000-4000-8ff0-0000000000a3',
  subB: '00000000-0000-4000-8ff0-000000000f02',
  contactB: '00000000-0000-4000-8ff0-00000000c002',
  taskB: '00000000-0000-4000-8ff0-00000000b402',
  notifB: '00000000-0000-4000-8ff0-00000000b502',
};

const POLICY_RESTORE: Record<string, string> = {
  subscriptions_select: `create policy subscriptions_select on app.subscriptions for select to fabsoft_app
    using (app.is_staff() or app.is_system()
           or (app.is_client_user() and client_id = app.ctx_client_id() and visible_in_portal)
           or app.integration_sees_client(client_id))`,
  client_contacts_select: `create policy client_contacts_select on app.client_contacts for select to fabsoft_app
    using (app.is_staff() or app.is_system()
           or (app.is_client_user() and client_id = app.ctx_client_id())
           or app.integration_sees_client(client_id))`,
  tasks_select: `create policy tasks_select on app.tasks for select to fabsoft_app
    using (app.is_staff() or app.is_system() or app.integration_sees_client(client_id))`,
  notifications_select: `create policy notifications_select on app.notifications for select to fabsoft_app
    using (app.is_staff() or app.is_system())`,
};

async function clientSeesOtherSubscription(): Promise<boolean> {
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
      `select id from app.subscriptions where id = $1`,
      [ids.subB],
    );
    await client.query('rollback');
    return rows.length > 0;
  } finally {
    client.release();
  }
}

async function clientSeesStaffOnlyRow(table: string, id: string): Promise<boolean> {
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
    const { rows } = await client.query<{ id: string }>(`select id from app.${table} where id = $1`, [id]);
    await client.query('rollback');
    return rows.length > 0;
  } finally {
    client.release();
  }
}

describe.skipIf(!ownerUrl)('RLS policy mutations (deben romper aislamiento)', () => {
  const owner = new pg.Pool({ connectionString: ownerUrl, max: 2 });

  beforeAll(async () => {
    const c = await owner.connect();
    try {
      await c.query('begin');
      await c.query(
        `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
      );
      await c.query(
        `insert into app.clients (id, legal_name) values ($1,'M A'),($2,'M B') on conflict do nothing`,
        [ids.clientA, ids.clientB],
      );
      await c.query(
        `insert into app.users (id, email, full_name, password_hash, role, client_id) values
          ($1,'mut-ca@t.co','Cli','h','client',$2) on conflict do nothing`,
        [ids.clientUserA, ids.clientA],
      );
      await c.query(
        `insert into app.products (id, name, product_type) values ($1,'Prod Mut','third_party') on conflict do nothing`,
        ['00000000-0000-4000-8ff0-0000000000f1'],
      );
      await c.query(
        `insert into app.subscriptions (id, client_id, product_id, start_date, current_period_end, billing_cycle,
           price_amount, supplier_cost_amount, status, visible_in_portal)
         values ($1,$2,$3,'2026-01-01','2026-12-31','annual',1,1,'active',true),
                ($4,$5,$3,'2026-01-01','2026-12-31','annual',2,2,'active',true) on conflict do nothing`,
        ['00000000-0000-4000-8ff0-000000000f01', ids.clientA, '00000000-0000-4000-8ff0-0000000000f1', ids.subB, ids.clientB],
      );
      await c.query(
        `insert into app.client_contacts (id, client_id, full_name, email) values ($1,$2,'B','b@c') on conflict do nothing`,
        [ids.contactB, ids.clientB],
      );
      await c.query(
        `insert into app.tasks (id, task_type, client_id, title, due_date, status) values
          ($1,'contact_client',$2,'T','2026-12-31','pending') on conflict do nothing`,
        [ids.taskB, ids.clientB],
      );
      await c.query(
        `insert into app.alert_rules (id, code, description, offset_days, channels) values
          ('00000000-0000-4000-8ff0-00000000b701','TST2','mut',15,'{in_app}') on conflict (code) do nothing`,
      );
      await c.query(
        `insert into app.notifications (id, notification_type, channel, recipient_user_id, scheduled_for, subscription_id, period_end, alert_rule_id, dedupe_key)
         values ($1,'expiration_alert','in_app',$2,now(),$3,'2026-12-31','00000000-0000-4000-8ff0-00000000b701','exp:$3:TST2:2026-12-31:in_app:$2') on conflict do nothing`,
        [ids.notifB, '00000000-0000-4000-8ff0-0000000000a1', ids.subB],
      );
      await c.query('commit');
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  });

  afterAll(async () => {
    await owner.end();
    if (appUrl) await getAppPool().end();
  });

  for (const [policy, restore] of Object.entries(POLICY_RESTORE)) {
    const table = policy.replace(/_select$/, '');

    it(`mutación ${policy} USING(true) expone alcance B`, async () => {
      const c = await owner.connect();
      try {
        await c.query('begin');
        await c.query(`drop policy if exists ${policy} on app.${table}`);
        await c.query(
          `create policy ${policy} on app.${table} for select to fabsoft_app using (true)`,
        );
        await c.query('commit');
      } finally {
        c.release();
      }
      try {
        if (policy === 'subscriptions_select') {
          expect(await clientSeesOtherSubscription()).toBe(false);
        } else if (policy === 'client_contacts_select') {
          expect(await clientSeesStaffOnlyRow('client_contacts', ids.contactB)).toBe(false);
        } else if (policy === 'tasks_select') {
          expect(await clientSeesStaffOnlyRow('tasks', ids.taskB)).toBe(false);
        } else {
          expect(await clientSeesStaffOnlyRow('notifications', ids.notifB)).toBe(false);
        }
      } finally {
        const r = await owner.connect();
        try {
          await r.query('begin');
          await r.query(`drop policy if exists ${policy} on app.${table}`);
          await r.query(restore);
          await r.query('commit');
        } finally {
          r.release();
        }
      }
    });
  }
});
