import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFactories, type Factories } from '../../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
} from '../../helpers/db.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../../helpers/app.js';

assertDbTestsRequired();

describe.skipIf(!dbTestsConfigured())('Automatización de solicitudes de renovación', () => {
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

  async function activeSubscriptionWithRequest() {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const client = await factories.client();
    const product = await factories.product();

    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId: client.id,
        productId: product.id,
        startDate: '2026-11-01',
        billingCycle: 'monthly',
        priceAmount: '100000.00',
      });
    expect(created.status).toBe(201);
    const subscriptionId = created.body.id as string;

    await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1 })
      .expect(200);

    const renewal = await request(app)
      .post('/api/v1/renewal-requests')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ subscriptionId, comment: 'Solicitud de prueba' });
    expect(renewal.status).toBe(201);

    return { app, token, subscriptionId, requestId: renewal.body.id as string };
  }

  it('no renovar resuelve la solicitud como no_renovada', async () => {
    const { app, token, subscriptionId, requestId } = await activeSubscriptionWithRequest();

    await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/not-renewed`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2, reason: 'El cliente no continúa' })
      .expect(200);

    const requestRes = await request(app)
      .get(`/api/v1/renewal-requests/${requestId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(requestRes.status).toBe(200);
    expect(requestRes.body.status).toBe('resuelta');
    expect(requestRes.body.resolution).toBe('no_renovada');
  });

  it('cancelar resuelve la solicitud como otra', async () => {
    const { app, token, subscriptionId, requestId } = await activeSubscriptionWithRequest();

    await request(app)
      .post(`/api/v1/subscriptions/${subscriptionId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2, reason: 'Cancelación de prueba' })
      .expect(200);

    const requestRes = await request(app)
      .get(`/api/v1/renewal-requests/${requestId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(requestRes.status).toBe(200);
    expect(requestRes.body.status).toBe('resuelta');
    expect(requestRes.body.resolution).toBe('otra');
  });
});
