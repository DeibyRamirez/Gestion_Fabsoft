/**
 * P1 — audit_log_changes_for_reader debe aplicar el mismo predicado que audit_logs_select (sin fuga cross-tenant).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { appDatabaseUrl, ensureAppPoolRoleVerified, getAppPool, provisionUrl } from '../helpers/db.js';

const ownerUrl = provisionUrl;
const appUrl = appDatabaseUrl;
const workerUrl = process.env.WORKER_DATABASE_URL;
const integrationUrl = appDatabaseUrl;

const clientAndina = '00000000-0000-4000-8ff0-0000000000d1';
const clientCafetal = '00000000-0000-4000-8ff0-0000000000d2';
const userAndina = '00000000-0000-4000-8ff0-0000000000d3';
const userAdmin = '00000000-0000-4000-8ff0-0000000000d4';
const userOp = '00000000-0000-4000-8ff0-0000000000d5';
const productId = '00000000-0000-4000-8ff0-0000000000d6';
const contactCafetal = '00000000-0000-4000-8ff0-0000000000d7';
const integrationId = '00000000-0000-4000-8ff0-0000000000d8';

const SECURE_READER_FN = `create or replace function app.audit_log_changes_for_reader(p_audit_log_id bigint)
returns jsonb
language sql stable security definer set search_path = pg_catalog, app as $$
  select case
    when app.is_admin()
      or app.is_system()
      or (
        app.is_operator()
        and al.resource_type = any (
          array[
            'client'::text, 'client_contact'::text, 'client_note'::text, 'product'::text,
            'subscription'::text, 'subscription_period'::text, 'renewal_request'::text, 'task'::text
          ]
        )
      )
    then app.audit_logs_reader_changes(al.changes, al.resource_type)
    else null
  end
  from app.audit_logs al
  where al.id = p_audit_log_id;
$$`;

const VULN_READER_FN = `create or replace function app.audit_log_changes_for_reader(p_audit_log_id bigint)
returns jsonb
language sql stable security definer set search_path = pg_catalog, app as $$
  select app.audit_logs_reader_changes(al.changes, al.resource_type)
  from app.audit_logs al
  where al.id = p_audit_log_id;
$$`;

type AuditIds = {
  contactCafetal: number;
  userRow: number;
  appSetting: number;
  product: number;
  clientAndina: number;
};

let auditIds: AuditIds;

async function withAppCtx<T>(
  sets: Record<string, string>,
  fn: (c: pg.PoolClient) => Promise<T>,
  loginUrl = appUrl,
  dbRole = 'fabsoft_app',
): Promise<T> {
  const pool =
    loginUrl === appUrl
      ? await (async () => {
          await ensureAppPoolRoleVerified();
          return getAppPool();
        })()
      : new pg.Pool({ connectionString: loginUrl!, max: 2 });
  const owned = loginUrl !== appUrl;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${dbRole}`);
    for (const [k, v] of Object.entries(sets)) {
      await client.query(`select set_config($1,$2,true)`, [`app.${k}`, v]);
    }
    const out = await fn(client);
    await client.query('rollback');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    client.release();
    if (owned) await pool.end();
  }
}

async function readerChanges(c: pg.PoolClient, auditLogId: number): Promise<unknown> {
  const { rows } = await c.query<{ changes: unknown }>(
    `select app.audit_log_changes_for_reader($1::bigint) as changes`,
    [auditLogId],
  );
  return rows[0]?.changes ?? null;
}

describe.skipIf(!ownerUrl || !appUrl)('audit_log_changes_for_reader · parity audit_logs_select', () => {
  beforeAll(async () => {
    const boot = new pg.Client({ connectionString: ownerUrl! });
    await boot.connect();
    try {
      await boot.query(
        `insert into app.clients (id, legal_name) values ($1,'Cliente Andina'),($2,'Cliente Cafetal')
         on conflict do nothing`,
        [clientAndina, clientCafetal],
      );
      await boot.query(
        `insert into app.users (id, email, full_name, password_hash, role, client_id, status) values
          ($1,'andina@t.co','User Andina','$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA','client',$3,'active'),
          ($2,'reader-admin@t.co','Reader Admin','$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA','admin',null,'active'),
          ($4,'reader-op@t.co','Reader Op','$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA','operator',null,'active')
         on conflict do nothing`,
        [userAndina, userAdmin, clientAndina, userOp],
      );
      await boot.query(
        `insert into app.products (id, name, product_type, status)
         values ($1,'Reader Product','third_party','active') on conflict do nothing`,
        [productId],
      );
      await boot.query(
        `insert into app.client_contacts (id, client_id, full_name, email, phone)
         values ($1,$2,'Cafetal Contact','leak@cafetal.co','+573001112233')
         on conflict do nothing`,
        [contactCafetal, clientCafetal],
      );
      await boot.query(
        `insert into app.integrations (id, slug, name, scopes, client_scope, manifest, manifest_version)
         values ($1,'reader-int','Reader Int','{clients:read}','all','{}','1.0.0') on conflict do nothing`,
        [integrationId],
      );
      await boot.query(
        `insert into app.app_settings (key, value) values ('reader_audit_key', '{"x":1}'::jsonb)
         on conflict (key) do update set value = excluded.value`,
      );
    } finally {
      await boot.end();
    }

    const reqBase = `req-reader-rls-${Date.now()}`;
    await ensureAppPoolRoleVerified();
    const w = await getAppPool().connect();
    try {
      await w.query('begin');
      await w.query('set local role fabsoft_app');
      await w.query(
        `select set_config('app.actor_type','user',true), set_config('app.actor_role','admin',true),
                set_config('app.current_user_id',$1,true), set_config('app.request_id',$2,true)`,
        [userAdmin, reqBase],
      );

      const write = async (
        action: string,
        resourceType: string,
        resourceId: string,
        suffix: string,
        payload: object,
      ): Promise<number> => {
        await w.query(`select set_config('app.request_id',$1,true)`, [`${reqBase}-${suffix}`]);
        await w.query(
          `select app.audit_write($1,$2,$3::text, $4::jsonb, null, null)`,
          [action, resourceType, resourceId, JSON.stringify(payload)],
        );
        const { rows } = await w.query<{ id: string }>(
          `select id::text from app.audit_logs where request_id = $1`,
          [`${reqBase}-${suffix}`],
        );
        return Number(rows[0]!.id);
      };

      auditIds = {
        contactCafetal: await write(
          'client_contact.updated',
          'client_contact',
          contactCafetal,
          'cc',
          {
            after: { full_name: 'Cafetal Contact', email: 'leak@cafetal.co', phone: '+573001112233' },
          },
        ),
        userRow: await write('user.updated', 'user', userAdmin, 'usr', {
          after: { email: 'reader-admin@t.co', full_name: 'Reader Admin' },
        }),
        appSetting: await write('app_setting.updated', 'app_setting', 'reader.audit.key', 'set', {
          after: { value: { x: 1 } },
        }),
        product: await write('product.updated', 'product', productId, 'prd', {
          after: { name: 'Reader Product', product_type: 'third_party' },
        }),
        clientAndina: await write('client.updated', 'client', clientAndina, 'cl', {
          after: { legal_name: 'Cliente Andina' },
        }),
      };
      await w.query('commit');
    } catch (e) {
      await w.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      w.release();
    }
  });

  afterAll(async () => {
    const o = new pg.Client({ connectionString: ownerUrl! });
    await o.connect();
    try {
      await o.query(SECURE_READER_FN);
    } finally {
      await o.end();
    }
  });

  it('(a) cliente portal: NULL fila ajena y propia (sin SELECT en política)', async () => {
    const changes = await withAppCtx(
      {
        actor_type: 'user',
        actor_role: 'client',
        current_user_id: userAndina,
        client_id: clientAndina,
      },
      async (c) => {
        return {
          foreign: await readerChanges(c, auditIds.contactCafetal),
          ownClient: await readerChanges(c, auditIds.clientAndina),
        };
      },
    );
    expect(changes.foreign).toBeNull();
    expect(changes.ownClient).toBeNull();
  });

  it('(b) integración: NULL en fila con PII', async () => {
    const changes = await withAppCtx(
      {
        actor_type: 'integration',
        actor_role: 'integration',
        integration_id: integrationId,
      },
      (c) => readerChanges(c, auditIds.contactCafetal),
      integrationUrl,
    );
    expect(changes).toBeNull();
  });

  it('(c) sin GUC de actor: NULL', async () => {
    const client = new pg.Client({ connectionString: appUrl! });
    await client.connect();
    try {
      await client.query('begin');
      await client.query('set local role fabsoft_app');
      const { rows } = await client.query<{ changes: unknown }>(
        `select app.audit_log_changes_for_reader($1::bigint) as changes`,
        [auditIds.contactCafetal],
      );
      expect(rows[0]?.changes ?? null).toBeNull();
      await client.query('rollback');
    } finally {
      await client.end();
    }
  });

  it.skipIf(!workerUrl)('(d) worker LOGIN hereda app: NULL sin contexto', async () => {
    const changes = await withAppCtx({}, (c) => readerChanges(c, auditIds.contactCafetal), workerUrl!);
    expect(changes).toBeNull();
  });

  it('(e) operador: NULL en user y app_setting; permitido en product', async () => {
    const out = await withAppCtx(
      {
        actor_type: 'user',
        actor_role: 'operator',
        current_user_id: userOp,
      },
      async (c) => ({
        user: await readerChanges(c, auditIds.userRow),
        appSetting: await readerChanges(c, auditIds.appSetting),
        product: await readerChanges(c, auditIds.product),
      }),
    );
    expect(out.user).toBeNull();
    expect(out.appSetting).toBeNull();
    expect(out.product).not.toBeNull();
  });

  it('(f) admin: datos redactados en user; operador en client_contact permitido', async () => {
    const admin = await withAppCtx(
      {
        actor_type: 'user',
        actor_role: 'admin',
        current_user_id: userAdmin,
      },
      (c) => readerChanges(c, auditIds.userRow),
    );
    expect(admin).not.toBeNull();
    expect(admin as { after?: { full_name?: string } }).toMatchObject({
      after: { full_name: 'Reader Admin' },
    });

    const opContact = await withAppCtx(
      {
        actor_type: 'user',
        actor_role: 'operator',
        current_user_id: userOp,
      },
      (c) => readerChanges(c, auditIds.contactCafetal),
    );
    expect(opContact).not.toBeNull();
    expect(opContact as { after?: { email?: string } }).toMatchObject({
      after: { email: 'leak@cafetal.co' },
    });
  });

  it('mutación: sin predicado el cliente vería PII (gate restaura función segura)', async () => {
    const owner = new pg.Client({ connectionString: ownerUrl! });
    await owner.connect();
    try {
      await owner.query(VULN_READER_FN);
      const leaked = await withAppCtx(
        {
          actor_type: 'user',
          actor_role: 'client',
          current_user_id: userAndina,
          client_id: clientAndina,
        },
        (c) => readerChanges(c, auditIds.contactCafetal),
      );
      expect(leaked).not.toBeNull();
    } finally {
      await owner.query(SECURE_READER_FN);
      await owner.end();
    }

    const sealed = await withAppCtx(
      {
        actor_type: 'user',
        actor_role: 'client',
        current_user_id: userAndina,
        client_id: clientAndina,
      },
      (c) => readerChanges(c, auditIds.contactCafetal),
    );
    expect(sealed).toBeNull();
  });
});