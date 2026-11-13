/**
 * Mutaciones USING(true): debe detectarse fuga (lectura cross-tenant) antes del ROLLBACK.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { getAppPool, migrationUrl } from '../helpers/db.js';
import {
  assertClientIsolationNoLeak,
  clientLeaksStaffRow,
  clientLeaksSubscriptionBase,
  setFabsoftAppClientA,
  type RlsFixtureIds,
} from './rls-isolation-checks.js';

const ownerUrl = migrationUrl;
const appUrl = process.env.TEST_DATABASE_URL;

if (process.env.REQUIRE_DB_TESTS === '1' && (!ownerUrl || !appUrl)) {
  throw new Error('rls-policy-mutation: URLs requeridas');
}

const ids: RlsFixtureIds = {
  clientA: '00000000-0000-4000-8ff0-000000000001',
  clientB: '00000000-0000-4000-8ff0-000000000002',
  clientUserA: '00000000-0000-4000-8ff0-0000000000a3',
  clientUserB: '00000000-0000-4000-8ff0-0000000000b3',
  subA: '00000000-0000-4000-8ff0-000000000f01',
  subB: '00000000-0000-4000-8ff0-000000000f02',
  renewalA: '00000000-0000-4000-8ff0-00000000b601',
  renewalB: '00000000-0000-4000-8ff0-00000000b602',
  contactB: '00000000-0000-4000-8ff0-00000000c002',
  taskB: '00000000-0000-4000-8ff0-00000000b402',
  notifB: '00000000-0000-4000-8ff0-00000000b502',
};

const MUTATIONS: { policy: string; table: string; leakCheck: (c: pg.PoolClient) => Promise<boolean> }[] =
  [
    {
      policy: 'subscriptions_select',
      table: 'subscriptions',
      leakCheck: (c) => clientLeaksSubscriptionBase(c, ids.subB),
    },
    {
      policy: 'client_contacts_select',
      table: 'client_contacts',
      leakCheck: (c) => clientLeaksStaffRow(c, 'client_contacts', ids.contactB),
    },
    {
      policy: 'tasks_select',
      table: 'tasks',
      leakCheck: (c) => clientLeaksStaffRow(c, 'tasks', ids.taskB),
    },
    {
      policy: 'notifications_select',
      table: 'notifications',
      leakCheck: (c) => clientLeaksStaffRow(c, 'notifications', ids.notifB),
    },
  ];

describe.skipIf(!ownerUrl)('RLS policy mutations (deben detectar fuga)', () => {
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
          ($1,'mut-ca@t.co','Cli A','h','client',$2),
          ($3,'mut-cb@t.co','Cli B','h','client',$4) on conflict do nothing`,
        [ids.clientUserA, ids.clientA, ids.clientUserB, ids.clientB],
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
        [ids.subA, ids.clientA, '00000000-0000-4000-8ff0-0000000000f1', ids.subB, ids.clientB],
      );
      await c.query(
        `insert into app.subscription_periods (id, subscription_id, period_number, start_date, end_date, billing_cycle,
           price_amount, supplier_cost_amount)
         select $1,$2,1,'2026-01-01','2026-12-31','annual',1,1
         where not exists (select 1 from app.subscription_periods p where p.subscription_id = $2 and p.period_number = 1)`,
        ['00000000-0000-4000-8ff0-00000000a101', ids.subA],
      );
      await c.query(
        `insert into app.subscription_periods (id, subscription_id, period_number, start_date, end_date, billing_cycle,
           price_amount, supplier_cost_amount)
         select $1,$2,1,'2026-01-01','2026-12-31','annual',2,2
         where not exists (select 1 from app.subscription_periods p where p.subscription_id = $2 and p.period_number = 1)`,
        ['00000000-0000-4000-8ff0-00000000a102', ids.subB],
      );
      await c.query(
        `insert into app.client_contacts (id, client_id, full_name, email) values ($1,$2,'Contact B','contact-b@fabsoft.test') on conflict do nothing`,
        [ids.contactB, ids.clientB],
      );
      await c.query(
        `insert into app.tasks (id, task_type, client_id, title, due_date, status) values
          ($1,'contact_client',$2,'Task Mut B','2026-12-31','pending') on conflict do nothing`,
        [ids.taskB, ids.clientB],
      );
      await c.query(
        `insert into app.alert_rules (id, code, description, offset_days, channels)
         select $1,'TSTMUT','mut', coalesce(max(offset_days),0)+1, '{in_app}'
         from app.alert_rules
         on conflict (code) do nothing`,
        ['00000000-0000-4000-8ff0-00000000b801'],
      );
      await c.query(
        `insert into app.notifications (id, notification_type, channel, recipient_user_id, scheduled_for, subscription_id, period_end, alert_rule_id, dedupe_key)
         select $1,'expiration_alert','in_app',$2,now(),$3,'2026-12-31', ar.id,'exp:$3:TSTMUT:2026-12-31:in_app:$2'
         from app.alert_rules ar where ar.code = 'TSTMUT'
         on conflict do nothing`,
        [ids.notifB, ids.clientUserB, ids.subB],
      );
      await c.query(
        `insert into app.renewal_requests (id, subscription_id, client_id, requested_by_user_id, status)
         values ($1,$2,$3,$4,'pending_review'),($5,$6,$7,$8,'pending_review') on conflict do nothing`,
        [
          ids.renewalA,
          ids.subA,
          ids.clientA,
          ids.clientUserA,
          ids.renewalB,
          ids.subB,
          ids.clientB,
          ids.clientUserB,
        ],
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

  it('T-F0-09c baseline: sin mutación el aislamiento se cumple', async () => {
    const c = await owner.connect();
    try {
      await c.query('begin');
      await setFabsoftAppClientA(c, ids);
      await expect(assertClientIsolationNoLeak(c, ids)).resolves.toBeUndefined();
      await c.query('rollback');
    } finally {
      c.release();
    }
  });

  for (const { policy, table, leakCheck } of MUTATIONS) {
    it(`mutación ${policy} USING(true) expone alcance B (detectable)`, async () => {
      const c = await owner.connect();
      try {
        await c.query('begin');
        await c.query(
          `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
        );
        await c.query(`drop policy if exists ${policy} on app.${table}`);
        await c.query(
          `create policy ${policy} on app.${table} for select to fabsoft_app using (true)`,
        );
        await setFabsoftAppClientA(c, ids);
        expect(await leakCheck(c)).toBe(true);
        await expect(assertClientIsolationNoLeak(c, ids)).rejects.toThrow();
        await c.query('rollback');
      } finally {
        c.release();
      }
    });
  }

});
