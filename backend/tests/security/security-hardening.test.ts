/**
 * Suite de endurecimiento (0003_security_hardening.sql, HT-03).
 * Requiere una BD con 0001-0003 aplicadas y TEST_DATABASE_MIGRATION_URL (rol propietario/superusuario
 * en la BD de tests). Las consultas de los actores se ejecutan con `SET LOCAL ROLE fabsoft_app`
 * y el mismo set_config que withRlsContext (ADR-004), dentro de transacciones que se revierten.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const url = process.env.TEST_DATABASE_MIGRATION_URL;
// Sin BD de tests (p. ej. `pnpm test` local sin Postgres) la suite se omite en vez de romper el resto.
// En CI TEST_DATABASE_MIGRATION_URL es obligatorio: definir REQUIRE_DB_TESTS=1 para que falle si falta.
if (!url && process.env.REQUIRE_DB_TESTS === '1') throw new Error('TEST_DATABASE_MIGRATION_URL no definido');
const pool = new pg.Pool({ connectionString: url, max: 2 });

type Ctx = { type: 'user' | 'integration' | 'system'; role: string; userId?: string; clientId?: string; integrationId?: string };
const ids = {
  clientA: '00000000-0000-0000-0000-00000000000a',
  clientB: '00000000-0000-0000-0000-00000000000b',
  admin: '00000000-0000-0000-0000-0000000000a1',
  operator: '00000000-0000-0000-0000-0000000000a2',
  clientUserA: '00000000-0000-0000-0000-0000000000a3',
  product: '00000000-0000-0000-0000-0000000000f1',
  subA: '00000000-0000-0000-0000-0000000000c1',
  subB: '00000000-0000-0000-0000-0000000000c2',
  intOwnA: '00000000-0000-0000-0000-0000000000e1',
  intAllNoScope: '00000000-0000-0000-0000-0000000000e2',
};
const admin: Ctx = { type: 'user', role: 'admin', userId: ids.admin };
const operator: Ctx = { type: 'user', role: 'operator', userId: ids.operator };
const clientA: Ctx = { type: 'user', role: 'client', userId: ids.clientUserA, clientId: ids.clientA };
const system: Ctx = { type: 'system', role: 'system' };
const intOwnA: Ctx = { type: 'integration', role: 'integration', integrationId: ids.intOwnA };
const intAllNoScope: Ctx = { type: 'integration', role: 'integration', integrationId: ids.intAllNoScope };

async function asActor<T>(ctx: Ctx, fn: (c: pg.PoolClient) => Promise<T>, role = 'fabsoft_app'): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    await c.query(
      `select set_config('app.actor_type',$1,true), set_config('app.actor_role',$2,true),
              set_config('app.current_user_id',$3,true), set_config('app.client_id',$4,true),
              set_config('app.integration_id',$5,true), set_config('app.request_id','test',true)`,
      [ctx.type, ctx.role, ctx.userId ?? '', ctx.clientId ?? '', ctx.integrationId ?? ''],
    );
    return await fn(c);
  } finally {
    await c.query('rollback').catch(() => undefined);
    c.release();
  }
}

// Ejecuta la sentencia en un SAVEPOINT para que el error no aborte la transacción del test.
async function expectPgError(c: pg.PoolClient, sql: string, params: unknown[], code: string) {
  await c.query('savepoint expect_err');
  await expect(c.query(sql, params)).rejects.toMatchObject({ code });
  await c.query('rollback to savepoint expect_err');
}

beforeAll(async () => {
  if (!url) return;
  const c = await pool.connect();
  try {
    await c.query('begin');
    // Contexto system para que los triggers (p. ej. guarda de precio) acepten los fixtures.
    await c.query(`select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`);
    await c.query(`insert into app.clients (id, legal_name) values ($1,'Cliente A'),($2,'Cliente B')`, [ids.clientA, ids.clientB]);
    await c.query(
      `insert into app.users (id, email, full_name, password_hash, role, client_id) values
        ($1,'admin@t.co','Admin','hash-admin','admin',null),
        ($2,'op@t.co','Operador','hash-op','operator',null),
        ($3,'ca@t.co','Cliente A','hash-ca','client',$4)`,
      [ids.admin, ids.operator, ids.clientUserA, ids.clientA],
    );
    await c.query(`insert into app.products (id, name, product_type) values ($1,'Licencia X','third_party')`, [ids.product]);
    await c.query(
      `insert into app.subscriptions (id, client_id, product_id, start_date, current_period_end, billing_cycle,
         price_amount, supplier_cost_amount, notes, status)
       values ($1,$2,$3,'2026-01-01','2026-12-31','annual',1000,600,'nota interna','active')`,
      [ids.subA, ids.clientA, ids.product],
    );
    await c.query(
      `insert into app.subscriptions (id, client_id, product_id, start_date, current_period_end, billing_cycle,
         price_amount, supplier_cost_amount, notes, status)
       values ($1,$2,$3,'2026-01-01','2026-12-31','annual',2000,900,'nota B','active')`,
      [ids.subB, ids.clientB, ids.product],
    );
    await c.query(
      `insert into app.subscription_periods (subscription_id, period_number, start_date, end_date, billing_cycle,
         price_amount, supplier_cost_amount)
       values ($1,1,'2026-01-01','2026-12-31','annual',1000,600), ($2,1,'2026-01-01','2026-12-31','annual',2000,900)`,
      [ids.subA, ids.subB],
    );
    await c.query(
      `insert into app.integrations (id, slug, name, scopes, client_scope, manifest, manifest_version) values
        ($1,'crm-a','CRM A','{subscriptions:read}','own','{}','1.0.0'),
        ($2,'bi-all','BI','{clients:read}','all','{}','1.0.0')`,
      [ids.intOwnA, ids.intAllNoScope],
    );
    await c.query(`insert into app.integration_clients (integration_id, client_id) values ($1,$2)`, [ids.intOwnA, ids.clientA]);
    await c.query(
      `insert into app.client_contacts (client_id, full_name, email) values ($1,'Contacto A','c@a.co')`, [ids.clientA]);
    await c.query('commit');
  } finally { c.release(); }
});

afterAll(async () => {
  if (!url) { await pool.end(); return; }
  await pool.query(`truncate app.refresh_tokens, app.audit_logs, app.idempotency_keys, app.client_contacts, app.integration_clients, app.integrations, app.subscription_periods,
                    app.subscriptions, app.products, app.users, app.clients cascade`);
  await pool.end();
});

describe.skipIf(!url)('H1 — inventario RLS', () => {
  it('T-SEC-08 todas las tablas de app tienen RLS habilitado, forzado y al menos una política', async () => {
    const { rows } = await pool.query('select * from app.rls_inventory()');
    expect(rows.length).toBeGreaterThanOrEqual(18);
    const bad = rows.filter((r) => !r.rls_enabled || !r.rls_forced || r.policy_count < 1);
    expect(bad, JSON.stringify(bad)).toEqual([]);
    await pool.query('select app.assert_rls_everywhere()');
  });

  it('T-SEC-09 una tabla nueva en app nace con ENABLE+FORCE RLS (event trigger)', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      const { rows: [et] } = await c.query(`select count(*)::int n from pg_event_trigger where evtname='fabsoft_enforce_rls'`);
      if (et.n === 0) return; // Supabase: sin event trigger; lo cubre T-SEC-08.
      await c.query('create table app.zz_probe (id int)');
      const { rows: [r] } = await c.query(
        `select relrowsecurity, relforcerowsecurity from pg_class where oid='app.zz_probe'::regclass`);
      expect(r).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    } finally { await c.query('rollback'); c.release(); }
  });
});

describe.skipIf(!url)('M1 — roles de BD', () => {
  it('T-SEC-10 fabsoft_app, fabsoft_worker y fabsoft_secure_view sin BYPASSRLS ni superusuario', async () => {
    const { rows } = await pool.query(
      `select rolname, rolbypassrls, rolsuper from pg_roles
        where rolname in ('fabsoft_app','fabsoft_worker','fabsoft_secure_view') order by 1`);
    expect(rows.map((r) => r.rolname)).toEqual(['fabsoft_app', 'fabsoft_secure_view', 'fabsoft_worker']);
    for (const r of rows) expect([r.rolname, r.rolbypassrls, r.rolsuper]).toEqual([r.rolname, false, false]);
  });

  it('T-SEC-11 fabsoft_app y fabsoft_worker sin CREATE en la BD; worker sí crea en pgboss', async () => {
    const { rows: [r] } = await pool.query(
      `select has_database_privilege('fabsoft_app', current_database(), 'CREATE') app,
              has_database_privilege('fabsoft_worker', current_database(), 'CREATE') worker,
              has_schema_privilege('fabsoft_worker','pgboss','CREATE') worker_pgboss,
              has_schema_privilege('fabsoft_app','pgboss','CREATE') app_pgboss,
              has_schema_privilege('fabsoft_app','app','CREATE') app_app`);
    expect(r).toEqual({ app: false, worker: false, worker_pgboss: true, app_pgboss: false, app_app: false });
    await asActor(system, (c) => expectPgError(c, 'create schema evil', [], '42501'));
  });
});

describe.skipIf(!url)('M2 — idempotency_keys', () => {
  const insert = (c: pg.PoolClient) => c.query(
    `insert into app.idempotency_keys (actor_type, actor_id, idem_key, request_method, request_path, request_hash)
     values ('user',$1,'key-12345','POST','/x','h')`, [ids.operator]);

  it('T-SEC-12 el actor lee/crea su clave pero no la borra', async () => {
    await asActor(operator, async (c) => {
      await insert(c);
      expect((await c.query('select id from app.idempotency_keys')).rowCount).toBe(1);
      expect((await c.query('delete from app.idempotency_keys')).rowCount).toBe(0);
    });
  });

  it('T-SEC-13 sólo el contexto system borra claves', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query('set local role fabsoft_app');
      await c.query(`select set_config('app.actor_type','user',true), set_config('app.actor_role','operator',true),
                            set_config('app.current_user_id',$1,true)`, [ids.operator]);
      await insert(c);
      await c.query(`select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true),
                            set_config('app.current_user_id','',true)`);
      expect((await c.query('delete from app.idempotency_keys')).rowCount).toBe(1);
    } finally { await c.query('rollback'); c.release(); }
  });
});

describe.skipIf(!url)('M7 — precio y costo sólo admin', () => {
  it('T-SEC-14 operador no cambia price_amount', () =>
    asActor(operator, (c) => expectPgError(c, 'update app.subscriptions set price_amount = 1 where id = $1', [ids.subA], '42501')));

  it('T-SEC-15 operador no cambia supplier_cost_amount', () =>
    asActor(operator, (c) => expectPgError(c, 'update app.subscriptions set supplier_cost_amount = 1 where id = $1', [ids.subA], '42501')));

  it('T-SEC-16 operador no fija supplier_cost_amount al crear', () =>
    asActor(operator, (c) => expectPgError(c,
      `insert into app.subscriptions (client_id, product_id, start_date, current_period_end, billing_cycle,
         price_amount, supplier_cost_amount) values ($1,$2,'2026-01-01','2026-12-31','annual',10,5)`,
      [ids.clientB, ids.product], '42501')));

  it('T-SEC-17 operador sí edita campos no sensibles y admin sí cambia precio', async () => {
    await asActor(operator, async (c) => {
      expect((await c.query(`update app.subscriptions set renewal_terms='x' where id=$1`, [ids.subA])).rowCount).toBe(1);
    });
    await asActor(admin, async (c) => {
      expect((await c.query('update app.subscriptions set price_amount=2, supplier_cost_amount=1 where id=$1', [ids.subA])).rowCount).toBe(1);
    });
  });
});

describe.skipIf(!url)('M3/M6 — el cliente no lee columnas sensibles ni contactos', () => {
  it('T-SEC-18 la tabla base subscriptions devuelve 0 filas al cliente', () =>
    asActor(clientA, async (c) => {
      expect((await c.query('select id from app.subscriptions')).rowCount).toBe(0);
      expect((await c.query('select id from app.subscription_periods')).rowCount).toBe(0);
    }));

  it('T-SEC-19 la vista del portal devuelve su suscripción sin supplier_cost_amount ni notes', () =>
    asActor(clientA, async (c) => {
      const r = await c.query('select * from app.portal_subscriptions');
      expect(r.rowCount).toBe(1);
      const cols = r.fields.map((f) => f.name);
      for (const banned of ['supplier_cost_amount', 'notes', 'owner_user_id', 'follow_up_status'])
        expect(cols).not.toContain(banned);
      await expectPgError(c, 'select supplier_cost_amount from app.portal_subscriptions', [], '42703');
    }));

  it('T-SEC-20 la vista del portal no devuelve nada a staff ni a otro cliente', async () => {
    await asActor(operator, async (c) =>
      expect((await c.query('select id from app.portal_subscriptions')).rowCount).toBe(0));
    // Cliente B: sólo ve la suscripción de B, nunca la de A.
    await asActor({ ...clientA, clientId: ids.clientB }, async (c) =>
      expect((await c.query('select id from app.portal_subscriptions')).rows).toEqual([{ id: ids.subB }]));
  });

  it('T-SEC-21 nadie lee users.password_hash vía fabsoft_app; la función sólo responde a su dueño/system', async () => {
    await asActor(clientA, async (c) => {
      await expectPgError(c, 'select password_hash from app.users', [], '42501');
      expect((await c.query('select id, email from app.users')).rows).toEqual([{ id: ids.clientUserA, email: 'ca@t.co' }]);
      expect((await c.query('select app.auth_password_hash($1) h', [ids.clientUserA])).rows[0].h).toBe('hash-ca');
      expect((await c.query('select app.auth_password_hash($1) h', [ids.admin])).rows[0].h).toBeNull();
    });
    await asActor(admin, (c) => expectPgError(c, 'select * from app.users', [], '42501'));
    await asActor(system, async (c) =>
      expect((await c.query('select app.auth_password_hash($1) h', [ids.admin])).rows[0].h).toBe('hash-admin'));
  });

  it('T-SEC-22 el cliente puede cambiar su contraseña (UPDATE sin leer el hash)', () =>
    asActor(clientA, async (c) => {
      expect((await c.query('update app.users set password_hash=$1 where id=$2', ['nuevo', ids.clientUserA])).rowCount).toBe(1);
    }));

  it('T-SEC-23 el cliente no ve client_contacts (ni de su organización)', () =>
    asActor(clientA, async (c) => expect((await c.query('select id from app.client_contacts')).rowCount).toBe(0)));

  it('T-SEC-24 el cliente sigue viendo productos de sus suscripciones visibles; staff ve contactos', async () => {
    const sec24 = {
      product: '00000000-0000-4000-8000-000000000024',
      sub: '00000000-0000-4000-8000-000000000124',
      contact: '00000000-0000-4000-8000-000000000224',
    };
    const owner = await pool.connect();
    try {
      await owner.query('begin');
      await owner.query(
        `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
      );
      await owner.query(
        `insert into app.products (id, name, product_type) values ($1,'SEC24 Prod','third_party') on conflict do nothing`,
        [sec24.product],
      );
      await owner.query(
        `insert into app.subscriptions (id, client_id, product_id, start_date, current_period_end, billing_cycle,
           price_amount, supplier_cost_amount, status, visible_in_portal)
         values ($1,$2,$3,'2026-06-01','2027-05-31','annual',10,5,'active',true) on conflict do nothing`,
        [sec24.sub, ids.clientA, sec24.product],
      );
      await owner.query(
        `insert into app.client_contacts (id, client_id, full_name, email)
         values ($1,$2,'SEC24','s24@t.co') on conflict do nothing`,
        [sec24.contact, ids.clientA],
      );
      await owner.query('commit');
    } finally {
      owner.release();
    }
    await asActor(clientA, async (c) => {
      const { rowCount } = await c.query('select id from app.products where id = $1', [sec24.product]);
      expect(rowCount).toBe(1);
    });
    await asActor(operator, async (c) => {
      const { rowCount } = await c.query('select id from app.client_contacts where id = $1', [sec24.contact]);
      expect(rowCount).toBe(1);
    });
  });
});

describe.skipIf(!url)('0004 — vistas de integración (matriz, nota 2)', () => {
  it('T-SEC-25 la integración no lee las tablas base subscriptions/subscription_periods', () =>
    asActor(intOwnA, async (c) => {
      expect((await c.query('select id from app.subscriptions')).rowCount).toBe(0);
      expect((await c.query('select id from app.subscription_periods')).rowCount).toBe(0);
      expect((await c.query('select supplier_cost_amount, notes from app.subscriptions')).rowCount).toBe(0);
    }));

  it('T-SEC-26 las vistas de integración no exponen supplier_cost_amount ni notes', () =>
    asActor(intOwnA, async (c) => {
      for (const v of ['app.integration_subscriptions', 'app.integration_subscription_periods']) {
        const r = await c.query(`select * from ${v}`);
        const cols = r.fields.map((f) => f.name);
        expect(cols).not.toContain('supplier_cost_amount');
        expect(cols).not.toContain('notes');
        await expectPgError(c, `select supplier_cost_amount from ${v}`, [], '42703');
      }
    }));

  it('T-SEC-27 integración own ve sólo sus clientes en las vistas', () =>
    asActor(intOwnA, async (c) => {
      expect((await c.query('select id, client_id from app.integration_subscriptions')).rows)
        .toEqual([{ id: ids.subA, client_id: ids.clientA }]);
      expect((await c.query('select subscription_id from app.integration_subscription_periods')).rows)
        .toEqual([{ subscription_id: ids.subA }]);
      expect((await c.query('select id from app.integration_subscriptions where id = $1', [ids.subB])).rowCount).toBe(0);
    }));

  it('T-SEC-28 integración sin scope subscriptions:read no ve nada (aunque client_scope=all)', () =>
    asActor(intAllNoScope, async (c) => {
      expect((await c.query('select id from app.integration_subscriptions')).rowCount).toBe(0);
      expect((await c.query('select id from app.integration_subscription_periods')).rowCount).toBe(0);
    }));

  it('T-SEC-29 staff y cliente no obtienen filas de las vistas de integración; staff sigue leyendo la base', async () => {
    const sec29 = {
      subA: '00000000-0000-4000-8000-000000000129',
      subB: '00000000-0000-4000-8000-000000000229',
      periodA: '00000000-0000-4000-8000-000000000329',
      periodB: '00000000-0000-4000-8000-000000000429',
    };
    const owner = await pool.connect();
    try {
      await owner.query('begin');
      await owner.query(
        `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
      );
      await owner.query(
        `insert into app.subscriptions (id, client_id, product_id, start_date, current_period_end, billing_cycle,
           price_amount, supplier_cost_amount, status)
         values ($1,$2,$3,'2026-06-01','2027-05-31','annual',1,1,'active'),
                ($4,$5,$3,'2026-06-01','2027-05-31','annual',2,2,'active')
         on conflict do nothing`,
        [sec29.subA, ids.clientA, ids.product, sec29.subB, ids.clientB],
      );
      await owner.query(
        `insert into app.subscription_periods (id, subscription_id, period_number, start_date, end_date, billing_cycle,
           price_amount, supplier_cost_amount)
         values ($1,$2,1,'2026-06-01','2027-05-31','annual',1,1),
                ($3,$4,1,'2026-06-01','2027-05-31','annual',2,2)
         on conflict do nothing`,
        [sec29.periodA, sec29.subA, sec29.periodB, sec29.subB],
      );
      await owner.query('commit');
    } finally {
      owner.release();
    }
    await asActor(operator, async (c) => {
      expect((await c.query('select id from app.integration_subscriptions')).rowCount).toBe(0);
      expect(
        (
          await c.query(`select id from app.subscriptions where id = any($1::uuid[])`, [
            [ids.subA, ids.subB, sec29.subA, sec29.subB],
          ])
        ).rowCount,
      ).toBe(4);
      expect(
        (
          await c.query(`select id from app.subscription_periods where id = any($1::uuid[])`, [
            [sec29.periodA, sec29.periodB],
          ])
        ).rowCount,
      ).toBe(2);
    });
    await asActor(clientA, async (c) =>
      expect((await c.query('select id from app.integration_subscriptions')).rowCount).toBe(0));
  });
});

describe.skipIf(!url)('0005 — funciones SECURITY DEFINER de auth', () => {
  const ARGON = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA';
  const fam = { a1: '00000000-0000-0000-0000-0000000000d1', a2: '00000000-0000-0000-0000-0000000000d2', adm: '00000000-0000-0000-0000-0000000000d3' };

  beforeAll(async () => {
    if (!url) return;
    await pool.query(
      `insert into app.refresh_tokens (user_id, family_id, token_hash, expires_at) values
        ($1,$2,'hash-a1', now() + interval '1 day'), ($1,$3,'hash-a2', now() + interval '1 day'),
        ($4,$5,'hash-adm', now() + interval '1 day')`,
      [ids.clientUserA, fam.a1, fam.a2, ids.admin, fam.adm]);
  });
  const active = async (userId: string) =>
    Number((await pool.query('select count(*) n from app.refresh_tokens where user_id=$1 and revoked_at is null', [userId])).rows[0].n);

  it('T-SEC-30 fabsoft_app (cualquier contexto) no puede ejecutar bootstrap_first_admin', async () => {
    for (const ctx of [admin, system, clientA])
      await asActor(ctx, (c) => expectPgError(c, 'select app.bootstrap_first_admin($1,$2,$3)', ['x@t.co', 'X', ARGON], '42501'));
  });

  it('T-SEC-31 bootstrap falla si ya existe un admin', () =>
    asActor(system, (c) => expectPgError(c, 'select app.bootstrap_first_admin($1,$2,$3)', ['x@t.co', 'X', ARGON], '42501'), 'fabsoft_bootstrap'));

  it('T-SEC-32 bootstrap crea el primer admin (temporal + auditoría), una sola vez, y exige argon2id', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      // Simula una BD sin admin (sólo en el test; replica desactiva tg_prevent_delete).
      await c.query(`set local session_replication_role = replica`);
      await c.query(`delete from app.refresh_tokens where user_id = $1`, [ids.admin]);
      await c.query(`delete from app.users where role = 'admin'`);
      await c.query(`set local session_replication_role = origin`);
      await c.query('set local role fabsoft_bootstrap');
      await expectPgError(c, 'select app.bootstrap_first_admin($1,$2,$3)', ['x@t.co', 'X', 'plano'], '22023');
      const { rows: [r] } = await c.query('select app.bootstrap_first_admin($1,$2,$3) id', [' Root@T.co ', 'Root', ARGON]);
      expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
      await expectPgError(c, 'select app.bootstrap_first_admin($1,$2,$3)', ['y@t.co', 'Y', ARGON], '42501');
      await c.query('reset role');
      const { rows: [u] } = await c.query('select email, role, must_change_password from app.users where id=$1', [r.id]);
      expect(u).toEqual({ email: 'root@t.co', role: 'admin', must_change_password: true });
      const { rows: [a] } = await c.query(`select count(*)::int n from app.audit_logs where action='user.bootstrap_admin' and resource_id=$1`, [r.id]);
      expect(a.n).toBe(1);
    } finally { await c.query('rollback'); c.release(); }
  });

  it('T-SEC-33 revocación atómica: desactivar + revocar en la misma transacción; rollback deshace ambos', async () => {
    const before = await active(ids.clientUserA);
    expect(before).toBe(2);
    await asActor(admin, async (c) => {
      await c.query(`update app.users set status='disabled' where id=$1`, [ids.clientUserA]);
      const { rows: [r] } = await c.query(`select app.revoke_user_sessions($1,'user_disabled') n`, [ids.clientUserA]);
      expect(r.n).toBe(2);
      const { rows: [a] } = await c.query(`select count(*)::int n from app.audit_logs where action='auth.sessions_revoked'`);
      expect(a.n).toBe(1);
    }); // asActor siempre hace ROLLBACK
    expect(await active(ids.clientUserA)).toBe(2);
    const { rows: [u] } = await pool.query('select status from app.users where id=$1', [ids.clientUserA]);
    expect(u.status).toBe('active');
  });

  it('T-SEC-34 el propio usuario revoca sus sesiones (conservando la actual) sin contexto system', () =>
    asActor(clientA, async (c) => {
      const { rows: [r] } = await c.query(`select app.revoke_user_sessions($1,'password_changed','hash-a1') n`, [ids.clientUserA]);
      expect(r.n).toBe(1);
    }));

  it('T-SEC-35 un usuario no revoca sesiones ajenas; motivo inválido rechazado', async () => {
    await asActor(clientA, (c) => expectPgError(c, `select app.revoke_user_sessions($1,'admin')`, [ids.admin], '42501'));
    await asActor(operator, (c) => expectPgError(c, `select app.revoke_user_sessions($1,'admin')`, [ids.clientUserA], '42501'));
    await asActor(admin, (c) => expectPgError(c, `select app.revoke_user_sessions($1,'rotated')`, [ids.clientUserA], '22023'));
    expect(await active(ids.admin)).toBe(1);
  });

  it('T-SEC-36 fuera de la función, un contexto de usuario sigue sin tocar refresh_tokens', () =>
    asActor(clientA, async (c) => {
      expect((await c.query('select id from app.refresh_tokens')).rowCount).toBe(0);
      expect((await c.query(`update app.refresh_tokens set revoked_at = null`)).rowCount).toBe(0);
    }));
});
