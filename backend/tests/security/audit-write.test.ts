/**
 * app.audit_write — contrato F0 (SECURITY DEFINER, sin INSERT directo, idempotencia, redacción).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  appDatabaseUrl,
  ensureAppPoolRoleVerified,
  getAppPool,
  provisionUrl,
} from '../helpers/db.js';

const ownerUrl = provisionUrl;
const appUrl = appDatabaseUrl;

if (process.env.REQUIRE_DB_TESTS === '1' && (!ownerUrl || !appUrl)) {
  throw new Error('audit-write: URLs de tests incompletas');
}

const productId = '00000000-0000-4000-8ff0-0000000000aa';
const adminId = '00000000-0000-4000-8ff0-0000000000ab';
const operatorId = '00000000-0000-4000-8000-000000000102';

async function withCtx<T>(
  ctx: {
    type: 'user' | 'system';
    role: string;
    userId?: string;
    clientId?: string;
    requestId?: string;
  },
  fn: (c: pg.PoolClient) => Promise<T>,
  commit = false,
): Promise<T> {
  await ensureAppPoolRoleVerified();
  const client = await getAppPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role fabsoft_app');
    await client.query(
      `select set_config('app.actor_type',$1,true), set_config('app.actor_role',$2,true),
              set_config('app.current_user_id',$3,true), set_config('app.client_id',$4,true),
              set_config('app.request_id',$5,true)`,
      [
        ctx.type,
        ctx.role,
        ctx.userId ?? '',
        ctx.clientId ?? '',
        ctx.requestId ?? 'audit-test',
      ],
    );
    const out = await fn(client);
    if (commit) await client.query('commit');
    else await client.query('rollback');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

describe.skipIf(!ownerUrl || !appUrl)('app.audit_write', () => {
  beforeAll(async () => {
    const c = new pg.Client({ connectionString: ownerUrl! });
    await c.connect();
    try {
      await c.query('begin');
      await c.query(
        `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
      );
      await c.query(
        `insert into app.users (id, email, full_name, password_hash, role, client_id)
         values ($1,'aud-admin@t.co','Aud Admin','$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA','admin',null)
         on conflict do nothing`,
        [adminId],
      );
      await c.query(
        `insert into app.users (id, email, full_name, password_hash, role, client_id, status)
         values ($1,'aud-op@t.co','Aud Op','$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA','operator',null,'active')
         on conflict do nothing`,
        [operatorId],
      );
      await c.query(
        `insert into app.products (id, name, product_type, status)
         values ($1,'Audit Product','third_party','active') on conflict do nothing`,
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

  it('positivo: mutación + evento en la misma transacción', async () => {
    const req = `req-${Date.now()}-ok`;
    await withCtx(
      { type: 'user', role: 'admin', userId: adminId, requestId: req },
      async (c) => {
        await c.query(`update app.products set name = $2 where id = $1`, [
          productId,
          'Audit Product Renamed',
        ]);
        const { rows } = await c.query<{ id: string }>(
          `select app.audit_write('product.updated','product',$1::text,
                 jsonb_build_object('before',jsonb_build_object('name','Audit Product'),
                                  'after',jsonb_build_object('name','Audit Product Renamed')),
                 null,null) as id`,
          [productId],
        );
        expect(rows[0]?.id).toBeTruthy();
        const { rows: ev } = await c.query<{ action: string }>(
          `select action from app.audit_logs where request_id = $1`,
          [req],
        );
        expect(ev).toHaveLength(1);
        expect(ev[0]!.action).toBe('product.updated');
      },
      true,
    );
  });

  it('fallo de auditoría revierte la mutación (commit no llega)', async () => {
    const req = `req-${Date.now()}-fail`;
    await expect(
      withCtx(
        { type: 'user', role: 'admin', userId: adminId, requestId: req },
        async (c) => {
          await c.query(`update app.products set name = $2 where id = $1`, [
            productId,
            'Should Roll Back',
          ]);
          await c.query(`select app.audit_write('product.updated','product',$1::text)`, [
            '00000000-0000-4000-8ff0-000000000099',
          ]);
        },
        true,
      ),
    ).rejects.toMatchObject({ code: '23503' });
    const c = new pg.Client({ connectionString: ownerUrl! });
    await c.connect();
    try {
      const { rows } = await c.query<{ name: string }>(
        `select name from app.products where id = $1`,
        [productId],
      );
      expect(rows[0]!.name).not.toBe('Should Roll Back');
    } finally {
      await c.end();
    }
  });

  it('sin contexto: ni audit_write ni INSERT directo', async () => {
    await ensureAppPoolRoleVerified();
    const client = await getAppPool().connect();
    try {
      await client.query('begin');
      await client.query('set local role fabsoft_app');
      await client.query('savepoint t1');
      await expect(
        client.query(`select app.audit_write('product.updated','product',$1::text)`, [productId]),
      ).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback to savepoint t1');
      await expect(
        client.query(
          `insert into app.audit_logs (actor_type, actor_user_id, action, resource_type, resource_id)
           values ('user',$1,'product.updated','product',$2)`,
          [adminId, productId],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('replay idempotente con el mismo request_id', async () => {
    const req = `req-idem-${Date.now()}`;
    const first = await withCtx(
      { type: 'user', role: 'admin', userId: adminId, requestId: req },
      async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `select app.audit_write('product.updated','product',$1::text,null,null,null)::text as id`,
          [productId],
        );
        return rows[0]!.id;
      },
      true,
    );
    const second = await withCtx(
      { type: 'user', role: 'admin', userId: adminId, requestId: req },
      async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `select app.audit_write('product.updated','product',$1::text,null,null,null)::text as id`,
          [productId],
        );
        return rows[0]!.id;
      },
      true,
    );
    expect(second).toBe(first);
    const c = new pg.Client({ connectionString: ownerUrl! });
    await c.connect();
    try {
      const { rows } = await c.query<{ n: number }>(
        `select count(*)::int as n from app.audit_logs where request_id = $1 and action = 'product.updated'`,
        [req],
      );
      expect(rows[0]!.n).toBe(1);
    } finally {
      await c.end();
    }
  });

  it('redacción profunda y supplier_cost_amount sólo en contexto admin', async () => {
    const subId = '00000000-0000-4000-8ff0-0000000000ad';
    const clientId = '00000000-0000-4000-8ff0-0000000000ae';
    const boot = new pg.Client({ connectionString: ownerUrl! });
    await boot.connect();
    try {
      await boot.query(
        `insert into app.clients (id, legal_name) values ($1,'Aud Client') on conflict do nothing`,
        [clientId],
      );
      await boot.query(
        `insert into app.subscriptions (id, client_id, product_id, start_date, current_period_end, billing_cycle,
           price_amount, status)
         values ($1,$2,$3,'2026-01-01','2026-12-31','annual',1,'active') on conflict do nothing`,
        [subId, clientId, productId],
      );
    } finally {
      await boot.end();
    }
    const reqOp = `req-redact-op-${Date.now()}`;
    await withCtx(
      { type: 'user', role: 'operator', userId: adminId, requestId: reqOp },
      async (c) => {
        await c.query(
          `select app.audit_write('subscription.updated','subscription',$1::text,
             jsonb_build_object('after', jsonb_build_object(
               'price_amount',1,'password_hash','leak','nested', jsonb_build_object('api_key','k'),
               'supplier_cost_amount', 99)), null, null)`,
          [subId],
        );
      },
      true,
    );
    const reqAd = `req-redact-ad-${Date.now()}`;
    await withCtx(
      { type: 'user', role: 'admin', userId: adminId, requestId: reqAd },
      async (c) => {
        await c.query(
          `select app.audit_write('subscription.updated','subscription',$1::text,
             jsonb_build_object('after', jsonb_build_object('supplier_cost_amount', 42)), null, null)`,
          [subId],
        );
      },
      true,
    );
    const db = new pg.Client({ connectionString: ownerUrl! });
    await db.connect();
    try {
      const { rows: op } = await db.query<{ changes: Record<string, unknown> }>(
        `select changes from app.audit_logs where request_id = $1`,
        [reqOp],
      );
      const after = (op[0]!.changes as { after?: Record<string, unknown> })?.after ?? {};
      expect(after.password_hash).toBe('[REDACTED]');
      expect(after.nested).toEqual({ api_key: '[REDACTED]' });
      expect(after.supplier_cost_amount).toBeUndefined();
      const { rows: ad } = await db.query<{ changes: Record<string, unknown> }>(
        `select changes from app.audit_logs where request_id = $1`,
        [reqAd],
      );
      const afterAd = (ad[0]!.changes as { after?: Record<string, unknown> })?.after ?? {};
      expect(afterAd.supplier_cost_amount).toBe(42);
    } finally {
      await db.end();
    }
  });

  it('product.created sin clave before en changes', async () => {
    const req = `req-create-${Date.now()}`;
    const pid = '00000000-0000-4000-8ff0-0000000000ac';
    const c = new pg.Client({ connectionString: ownerUrl! });
    await c.connect();
    try {
      await c.query(
        `insert into app.products (id, name, product_type) values ($1,'Tmp','third_party') on conflict do nothing`,
        [pid],
      );
    } finally {
      await c.end();
    }
    await withCtx(
      { type: 'user', role: 'admin', userId: adminId, requestId: req },
      async (client) => {
        await client.query(
          `select app.audit_write('product.created','product',$1::text,
            jsonb_build_object('before', jsonb_build_object('name','old'),
                             'after', jsonb_build_object('name','Tmp')), null, null)`,
          [pid],
        );
      },
      true,
    );
    const r = new pg.Client({ connectionString: ownerUrl! });
    await r.connect();
    try {
      const { rows } = await r.query<{ changes: { before?: unknown } }>(
        `select changes from app.audit_logs where request_id = $1`,
        [req],
      );
      expect(rows[0]!.changes?.before).toBeUndefined();
    } finally {
      await r.end();
    }
  });

  it('fabsoft_app LOGIN: deniega DML y TRUNCATE directo en audit_logs', async () => {
    const client = new pg.Client({ connectionString: appUrl! });
    await client.connect();
    try {
      for (const sql of [
        `insert into app.audit_logs (actor_type, action, resource_type, resource_id)
         values ('system','product.updated','product','x')`,
        `update app.audit_logs set action = 'x' where false`,
        `delete from app.audit_logs where false`,
        `truncate app.audit_logs`,
      ]) {
        await expect(client.query(sql)).rejects.toBeTruthy();
      }
    } finally {
      await client.end();
    }
  });

  for (const [label, url] of [
    ['fabsoft_worker', process.env.WORKER_DATABASE_URL],
    ['fabsoft_bootstrap', process.env.BOOTSTRAP_DATABASE_URL],
  ] as const) {
    it.skipIf(!url)(`${label} LOGIN: INSERT en audit_logs → 42501`, async () => {
      const client = new pg.Client({ connectionString: url! });
      await client.connect();
      try {
        await expect(
          client.query(
            `insert into app.audit_logs (actor_type, action, resource_type, resource_id)
             values ('system','product.updated','product','x')`,
          ),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await client.end();
      }
    });
  }

  it('mismo request_id servidor: admin no reutiliza fila del operador', async () => {
    const req = `req-shared-${Date.now()}`;
    const opRow = await withCtx(
      { type: 'user', role: 'operator', userId: operatorId, requestId: req },
      async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `select app.audit_write('product.updated','product',$1::text,null,null,null)::text as id`,
          [productId],
        );
        return rows[0]!.id;
      },
      true,
    );
    const adminIdem = await withCtx(
      { type: 'user', role: 'admin', userId: adminId, requestId: req },
      async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `select app.audit_write('product.updated','product',$1::text,null,null,null)::text as id`,
          [productId],
        );
        return rows[0]!.id;
      },
      true,
    );
    expect(adminIdem).not.toBe(opRow);
  });

  it('operador LOGIN no ve supplier_cost_amount (incl. fila escrita por admin)', async () => {
    const subId = '00000000-0000-4000-8ff0-0000000000bf';
    const clientId = '00000000-0000-4000-8ff0-0000000000be';
    const opUser = '00000000-0000-4000-8ff0-0000000000c0';
    const boot = new pg.Client({ connectionString: ownerUrl! });
    await boot.connect();
    try {
      await boot.query(
        `insert into app.users (id, email, full_name, password_hash, role, client_id, status)
         values ($1,'op-read@t.co','Op','$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA','operator',null,'active')
         on conflict do nothing`,
        [opUser],
      );
      await boot.query(
        `insert into app.clients (id, legal_name) values ($1,'Op Client') on conflict do nothing`,
        [clientId],
      );
      await boot.query(
        `insert into app.subscriptions (id, client_id, product_id, start_date, current_period_end, billing_cycle, price_amount, status)
         values ($1,$2,$3,'2026-01-01','2026-12-31','annual',9,'active') on conflict do nothing`,
        [subId, clientId, productId],
      );
    } finally {
      await boot.end();
    }
    const reqAd = `req-sup-admin-${Date.now()}`;
    await withCtx(
      { type: 'user', role: 'admin', userId: adminId, requestId: reqAd },
      async (c) => {
        await c.query(
          `select app.audit_write('subscription.updated','subscription',$1::text,
             jsonb_build_object('after', jsonb_build_object('supplier_cost_amount', 777)), null, null)`,
          [subId],
        );
      },
      true,
    );
    const client = new pg.Client({ connectionString: appUrl! });
    await client.connect();
    try {
      await client.query('begin');
      await client.query('set local role fabsoft_app');
      await client.query(
        `select set_config('app.actor_type','user',true), set_config('app.actor_role','operator',true),
                set_config('app.current_user_id',$1,true), set_config('app.request_id','op-read',true)`,
        [opUser],
      );
      const { rows } = await client.query<{ changes: { after?: Record<string, unknown> } }>(
        `select app.audit_logs_reader_changes(changes, resource_type) as changes
         from app.audit_logs where request_id = $1`,
        [reqAd],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.changes?.after?.supplier_cost_amount).toBeUndefined();
      await client.query('rollback');
    } finally {
      await client.end();
    }
  });
});
