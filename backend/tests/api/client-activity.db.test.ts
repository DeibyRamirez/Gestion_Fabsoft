import request from 'supertest';
import { randomUUID } from 'node:crypto';
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

describe.skipIf(!dbTestsConfigured())('Client activity API (Postgres)', () => {
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

  async function seedActivity() {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);

    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(subscriptionBody(client.id, product.id));
    expect(created.status).toBe(201);

    const patched = await request(app)
      .patch(`/api/v1/subscriptions/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, notes: 'seguimiento' });
    expect(patched.status).toBe(200);

    return { app, client, operator, token };
  }

  it('operator ve la actividad del cliente sin before/after', async () => {
    const { app, client, operator, token } = await seedActivity();

    const res = await request(app)
      .get(`/api/v1/clients/${client.id}/activity`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expectMatchesOperation(res, 'listClientActivity');
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);

    const updated = res.body.data.find(
      (item: { action: string }) => item.action === 'subscription.updated',
    );
    expect(updated).toMatchObject({
      actor: { id: operator.id, name: operator.fullName },
      action: 'subscription.updated',
      resourceType: 'subscription',
      resourceId: expect.any(String),
      summary: 'Suscripción actualizada',
    });
    expect(updated).not.toHaveProperty('changes');
    expect(JSON.stringify(res.body)).not.toMatch(/"before"|"after"/);
  });

  it('admin también consulta y respeta la paginación', async () => {
    const { app, client } = await seedActivity();
    const admin = await factories.adminUser();
    const adminToken = await factories.tokenFor(admin);

    const res = await request(app)
      .get(`/api/v1/clients/${client.id}/activity?page=1&pageSize=1`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.pageSize).toBe(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('client recibe 403 y un cliente inexistente 404', async () => {
    const { app, client } = await seedActivity();
    const clientUser = await factories.clientUser(client);
    const clientToken = await factories.tokenFor(clientUser);
    const operator = await factories.operatorUser();
    const operatorToken = await factories.tokenFor(operator);

    expect(
      (
        await request(app)
          .get(`/api/v1/clients/${client.id}/activity`)
          .set('Authorization', `Bearer ${clientToken}`)
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .get(`/api/v1/clients/${randomUUID()}/activity`)
          .set('Authorization', `Bearer ${operatorToken}`)
      ).status,
    ).toBe(404);
  });
});
