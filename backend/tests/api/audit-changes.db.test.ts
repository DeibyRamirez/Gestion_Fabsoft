/**
 * P1.1 — snapshots HTTP en camelCase persisten before/after campo a campo en audit_logs.
 */
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createFactories, type Factories } from '../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  provisionUrl,
  resetDatabase,
} from '../helpers/db.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../helpers/app.js';
import { prepareAuditChanges } from '../../src/infrastructure/persistence/pg/shared/audit-redact.js';

assertDbTestsRequired();

async function latestAuditChanges(
  resourceType: string,
  resourceId: string,
): Promise<{ before?: Record<string, unknown>; after?: Record<string, unknown> } | null> {
  if (!provisionUrl) throw new Error('provision url requerida');
  const c = new pg.Client({ connectionString: provisionUrl });
  await c.connect();
  try {
    const { rows } = await c.query<{ changes: Record<string, unknown> | null }>(
      `select changes from app.audit_logs
       where resource_type = $1 and resource_id = $2
       order by id desc limit 1`,
      [resourceType, resourceId],
    );
    return (
      (rows[0]?.changes as { before?: Record<string, unknown>; after?: Record<string, unknown> }) ??
      null
    );
  } finally {
    await c.end();
  }
}

describe.skipIf(!dbTestsConfigured())('audit changes (HTTP + BD)', () => {
  let factories: Factories;

  beforeAll(async () => {
    factories = createFactories({ tokens: await getTestAccessTokens() });
  });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  it('product — productType en before/after distintos', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const reqId = randomUUID();

    const create = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', reqId)
      .send({ name: 'Audit P', productType: 'third_party', vendor: 'V1' });
    expect(create.status).toBe(201);
    const id = create.body.id as string;

    const patch = await request(app)
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', randomUUID())
      .send({ productType: 'own' });
    expect(patch.status).toBe(200);

    const ch = await latestAuditChanges('product', id);
    expect(ch?.after?.product_type).toBe('own');
    expect(ch?.before?.product_type).toBe('third_party');
    expect(ch?.before?.product_type).not.toBe(ch?.after?.product_type);
  });

  it('user — fullName y clientId en changes', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);

    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: `aud-u-${Date.now()}@t.co`, fullName: 'Antes', role: 'operator' });
    expect(create.status).toBe(201);
    const id = create.body.id as string;

    const patch = await request(app)
      .patch(`/api/v1/users/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Después', role: 'operator' });
    expect(patch.status).toBe(200);

    const ch = await latestAuditChanges('user', id);
    expect(ch?.before?.full_name).toBe('Antes');
    expect(ch?.after?.full_name).toBe('Después');
    expect(ch?.after?.role).toBe('operator');
  });

  it('app_setting — value anidado no vacío (mismo pipeline que HTTP)', async () => {
    if (!provisionUrl) throw new Error('provision');
    const admin = await factories.adminUser();
    const key = `audit_setting_${Date.now()}`;
    const boot = new pg.Client({ connectionString: provisionUrl });
    await boot.connect();
    try {
      await boot.query(
        `insert into app.app_settings (key, value, updated_by) values ($1, $2::jsonb, $3)`,
        [key, JSON.stringify({ notifyDays: [30, 15], enabled: true }), admin.id],
      );
    } finally {
      await boot.end();
    }
    const payload = prepareAuditChanges({
      before: { value: { notifyDays: [30, 15], enabled: true } },
      after: { value: { notifyDays: [30, 15, 7], enabled: true } },
    });
    const { getAppPool, ensureAppPoolRoleVerified } = await import('../helpers/db.js');
    await ensureAppPoolRoleVerified();
    const client = await getAppPool().connect();
    try {
      await client.query('begin');
      await client.query('set local role fabsoft_app');
      await client.query(
        `select set_config('app.actor_type','user',true), set_config('app.actor_role','admin',true),
                set_config('app.current_user_id',$1,true), set_config('app.request_id',$2,true)`,
        [admin.id, randomUUID()],
      );
      await client.query(
        `select app.audit_write('app_setting.updated','app_setting',$1::text, $2::jsonb, null, null)`,
        [key, JSON.stringify(payload)],
      );
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
    const ch = await latestAuditChanges('app_setting', key);
    expect(ch?.before?.value).toEqual({ notify_days: [30, 15], enabled: true });
    expect(ch?.after?.value).toEqual({ notify_days: [30, 15, 7], enabled: true });
  });
});
