/**
 * P1.2 — columna changes: SELECT directo 42501; lectura vía audit_log_changes_for_reader.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { appDatabaseUrl, ensureAppPoolRoleVerified, getAppPool, provisionUrl } from '../helpers/db.js';

const ownerUrl = provisionUrl;
const appUrl = appDatabaseUrl;

if (process.env.REQUIRE_DB_TESTS === '1' && (!ownerUrl || !appUrl)) {
  throw new Error('audit-changes-column: URLs incompletas');
}

const productId = '00000000-0000-4000-8ff0-0000000000ca';
const adminId = '00000000-0000-4000-8ff0-0000000000cb';
const operatorId = '00000000-0000-4000-8ff0-0000000000cc';

describe.skipIf(!ownerUrl || !appUrl)('audit_logs.changes column privilege', () => {
  beforeAll(async () => {
    const c = new pg.Client({ connectionString: ownerUrl! });
    await c.connect();
    try {
      await c.query('begin');
      await c.query(
        `insert into app.users (id, email, full_name, password_hash, role, client_id)
         values ($1,'col-admin@t.co','Col Admin','$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA','admin',null)
         on conflict do nothing`,
        [adminId],
      );
      await c.query(
        `insert into app.users (id, email, full_name, password_hash, role, client_id, status)
         values ($1,'col-op@t.co','Col Operator','$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA','operator',null,'active')
         on conflict do nothing`,
        [operatorId],
      );
      await c.query(
        `insert into app.products (id, name, product_type) values ($1,'Col','third_party') on conflict do nothing`,
        [productId],
      );
      await c.query('commit');
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      await c.end();
    }
  });

  it('operador LOGIN: SELECT changes → 42501', async () => {
    const client = new pg.Client({ connectionString: appUrl! });
    await client.connect();
    try {
      await client.query('begin');
      await client.query('set local role fabsoft_app');
      await client.query(
        `select set_config('app.actor_type','user',true), set_config('app.actor_role','operator',true),
                set_config('app.current_user_id',$1,true)`,
        [operatorId],
      );
      await expect(client.query(`select changes from app.audit_logs limit 1`)).rejects.toMatchObject({
        code: '42501',
      });
      await client.query('rollback');
    } finally {
      await client.end();
    }
  });

  it('reader definer: operador no ve supplier_cost_amount (fila escrita por admin)', async () => {
    const subId = '00000000-0000-4000-8ff0-0000000000cd';
    const clientId = '00000000-0000-4000-8ff0-0000000000ce';
    const req = `req-col-${Date.now()}`;
    const boot = new pg.Client({ connectionString: ownerUrl! });
    await boot.connect();
    try {
      await boot.query(
        `insert into app.clients (id, legal_name) values ($1,'C') on conflict do nothing`,
        [clientId],
      );
      await boot.query(
        `insert into app.subscriptions (id, client_id, product_id, start_date, current_period_end, billing_cycle, price_amount, status)
         values ($1,$2,$3,'2026-01-01','2026-12-31','annual',1,'active') on conflict do nothing`,
        [subId, clientId, productId],
      );
    } finally {
      await boot.end();
    }

    await ensureAppPoolRoleVerified();
    const writer = await getAppPool().connect();
    try {
      await writer.query('begin');
      await writer.query('set local role fabsoft_app');
      await writer.query(
        `select set_config('app.actor_type','user',true), set_config('app.actor_role','admin',true),
                set_config('app.current_user_id',$1,true), set_config('app.request_id',$2,true)`,
        [adminId, req],
      );
      await writer.query(
        `select app.audit_write('subscription.updated','subscription',$1::text,
           jsonb_build_object('after', jsonb_build_object('supplier_cost_amount', 501)), null, null)`,
        [subId],
      );
      await writer.query('commit');
    } finally {
      writer.release();
    }

    const reader = new pg.Client({ connectionString: appUrl! });
    await reader.connect();
    try {
      await reader.query('begin');
      await reader.query('set local role fabsoft_app');
      await reader.query(
        `select set_config('app.actor_type','user',true), set_config('app.actor_role','operator',true),
                set_config('app.current_user_id',$1,true)`,
        [operatorId],
      );
      const { rows } = await reader.query<{ changes: { after?: Record<string, unknown> } }>(
        `select app.audit_log_changes_for_reader(id) as changes
         from app.audit_logs where request_id = $1`,
        [req],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.changes?.after?.supplier_cost_amount).toBeUndefined();
      await reader.query('rollback');
    } finally {
      await reader.end();
    }
  });

  it('mutación GRANT SELECT(changes): si se restaura el GRANT el gate 42501 queda verde', async () => {
    const owner = new pg.Client({ connectionString: ownerUrl! });
    await owner.connect();
    try {
      await owner.query(`grant select (changes) on app.audit_logs to fabsoft_app`);
    } finally {
      await owner.end();
    }
    try {
      const client = new pg.Client({ connectionString: appUrl! });
      await client.connect();
      try {
        await client.query('begin');
        await client.query('set local role fabsoft_app');
        await client.query(
          `select set_config('app.actor_type','user',true), set_config('app.actor_role','operator',true),
                  set_config('app.current_user_id',$1,true)`,
          [operatorId],
        );
        const res = await client.query(`select changes from app.audit_logs limit 1`);
        expect(res.rowCount).toBeGreaterThanOrEqual(0);
      } finally {
        await client.end();
      }
    } finally {
      const fix = new pg.Client({ connectionString: ownerUrl! });
      await fix.connect();
      try {
        await fix.query(`revoke select (changes) on app.audit_logs from fabsoft_app`);
      } finally {
        await fix.end();
      }
    }
  });
});