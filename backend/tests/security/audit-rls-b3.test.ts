/**
 * audit_write B3 — rol desconocido, tenant ajeno, recurso prohibido cliente.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { appDatabaseUrl, ensureAppPoolRoleVerified, getAppPool, provisionUrl } from '../helpers/db.js';

const ownerUrl = provisionUrl;
const appUrl = appDatabaseUrl;

async function withCtx<T>(
  sets: Record<string, string>,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  await ensureAppPoolRoleVerified();
  const client = await getAppPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role fabsoft_app');
    const entries = Object.entries(sets);
    for (const [k, v] of entries) {
      await client.query(`select set_config($1,$2,true)`, [`app.${k}`, v]);
    }
    const out = await fn(client);
    await client.query('rollback');
    return out;
  } finally {
    client.release();
  }
}

describe.skipIf(!ownerUrl || !appUrl)('audit_write B3', () => {
  const clientA = '00000000-0000-4000-8ff0-00000000b301';
  const clientB = '00000000-0000-4000-8ff0-00000000b302';
  const clientUserId = '00000000-0000-4000-8ff0-00000000b303';
  const productId = '00000000-0000-4000-8ff0-00000000b304';

  beforeAll(async () => {
    const boot = new pg.Client({ connectionString: ownerUrl! });
    await boot.connect();
    try {
      await boot.query(
        `insert into app.clients (id, legal_name) values ($1,'Client A'),($2,'Client B') on conflict do nothing`,
        [clientA, clientB],
      );
      await boot.query(
        `insert into app.users (id, email, full_name, password_hash, role, client_id, status)
         values ($1,'b3client@t.co','B3 Client','$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA','client',$2,'active')
         on conflict do nothing`,
        [clientUserId, clientA],
      );
      await boot.query(
        `insert into app.products (id, name, product_type, status)
         values ($1,'B3 Product','third_party','active') on conflict do nothing`,
        [productId],
      );
    } finally {
      await boot.end();
    }
  });

  it('B3a: rol de usuario desconocido → 42501', async () => {
    await expect(
      withCtx(
        {
          actor_type: 'user',
          actor_role: 'superuser',
          current_user_id: '00000000-0000-4000-8ff0-0000000000ab',
          request_id: 'b3a',
        },
        (c) =>
          c.query(`select app.audit_write('product.updated','product',$1::text)`, [
            '00000000-0000-4000-8ff0-0000000000aa',
          ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('B3b: client tenant ajeno → 42501', async () => {
    await expect(
      withCtx(
        {
          actor_type: 'user',
          actor_role: 'client',
          current_user_id: clientUserId,
          client_id: clientA,
          request_id: 'b3b',
        },
        (c) =>
          c.query(`select app.audit_write('client.updated','client',$1::text)`, [clientB]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('B3c: client no puede auditar product → 42501', async () => {
    await expect(
      withCtx(
        {
          actor_type: 'user',
          actor_role: 'client',
          current_user_id: clientUserId,
          client_id: clientA,
          request_id: 'b3c',
        },
        (c) =>
          c.query(`select app.audit_write('product.updated','product',$1::text)`, [productId]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
