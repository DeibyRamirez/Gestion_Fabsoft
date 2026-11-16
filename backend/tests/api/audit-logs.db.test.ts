import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFactories, type Factories } from '../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
} from '../helpers/db.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../helpers/app.js';
import { expectMatchesOperation } from '../helpers/openapi.js';

assertDbTestsRequired();

const subscriptionBody = (clientId: string, productId: string) => ({
  clientId,
  productId,
  startDate: '2026-11-01',
  billingCycle: 'monthly',
  priceAmount: '100000.00',
});

describe.skipIf(!dbTestsConfigured())('Audit logs API (Postgres)', () => {
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

  it('admin consulta el before/after de una edición de suscripción', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const admin = await factories.adminUser();
    const operatorToken = await factories.tokenFor(operator);
    const adminToken = await factories.tokenFor(admin);

    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(subscriptionBody(client.id, product.id));
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const patched = await request(app)
      .patch(`/api/v1/subscriptions/${id}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ version: 1, notes: 'seguimiento' });
    expect(patched.status).toBe(200);

    const list = await request(app)
      .get(
        `/api/v1/audit-logs?action=subscription.updated&resourceType=subscription&resourceId=${id}`,
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expectMatchesOperation(list, 'listAuditLogs');
    expect(list.body.data).toHaveLength(1);

    const row = list.body.data[0];
    expect(row.actorType).toBe('user');
    expect(row.actor).toEqual({ id: operator.id, name: operator.fullName });
    expect(row.resourceType).toBe('subscription');
    expect(row.resourceId).toBe(id);
    expect(row.clientId).toBe(client.id);
    expect(row.changes.before.notes).toBeNull();
    expect(row.changes.after.notes).toBe('seguimiento');
    expect(Number.isNaN(Date.parse(row.occurredAt))).toBe(false);

    const filtered = await request(app)
      .get(`/api/v1/audit-logs?actorId=${operator.id}&clientId=${client.id}&pageSize=1`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.meta.total).toBeGreaterThan(1);
  });

  it('operator y client no pueden consultar audit-logs', async () => {
    const app = await buildTestApp();
    const operator = await factories.operatorUser();
    const client = await factories.client();
    const clientUser = await factories.clientUser(client);
    const operatorToken = await factories.tokenFor(operator);
    const clientToken = await factories.tokenFor(clientUser);

    expect(
      (await request(app).get('/api/v1/audit-logs').set('Authorization', `Bearer ${operatorToken}`))
        .status,
    ).toBe(403);
    expect(
      (await request(app).get('/api/v1/audit-logs').set('Authorization', `Bearer ${clientToken}`))
        .status,
    ).toBe(403);
  });
});
