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

describe.skipIf(!dbTestsConfigured())('Subscriptions API (Postgres)', () => {
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

  const bodyFor = (clientId: string, productId: string, over: Record<string, unknown> = {}) => ({
    clientId,
    productId,
    startDate: '2026-11-01',
    billingCycle: 'monthly',
    priceAmount: '100000.00',
    ...over,
  });

  it('T-HU06 — operator crea la suscripción con periodo 1 pendiente', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);

    const res = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyFor(client.id, product.id));
    expect(res.status).toBe(201);
    expect(res.headers.location).toMatch(/\/api\/v1\/subscriptions\//);
    expectMatchesOperation(res, 'createSubscription');
    expect(res.body.status).toBe('pending_activation');
    expect(res.body.currentPeriodEnd).toBe('2026-11-30');
    expect(res.body.priceAmount).toBe('100000.00');
    expect(res.body.currentPeriod.periodNumber).toBe(1);
    expect(res.body.currentPeriod.endDate).toBe('2026-11-30');
    expect(res.body.currentPeriod.priceAmount).toBe('100000.00');
  });

  it('T-HU06 — cliente archivado y producto inactivo ⇒ 422', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const activeClient = await factories.client();
    const activeProduct = await factories.product();
    const archivedClient = await factories.client({ status: 'archived' });
    const inactiveProduct = await factories.product({ status: 'inactive' });

    const archived = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyFor(archivedClient.id, activeProduct.id));
    expect(archived.status).toBe(422);
    expect(archived.body.code).toBe('client_archived');

    const inactive = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyFor(activeClient.id, inactiveProduct.id));
    expect(inactive.status).toBe(422);
    expect(inactive.body.code).toBe('product_inactive');
  });

  it('T-HU06 — ciclo custom sin meses ⇒ 400', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);

    const res = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyFor(client.id, product.id, { billingCycle: 'custom' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_error');
  });

  it('T-HU06 — mismo Idempotency-Key crea una sola suscripción', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const key = randomUUID();
    const body = bodyFor(client.id, product.id);

    const first = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(body);
    const second = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const list = await request(app)
      .get(`/api/v1/subscriptions?clientId=${client.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('T-HU06 — ?productId lista las suscripciones del producto (RN-02)', async () => {
    const app = await buildTestApp();
    const product = await factories.product();
    const one = await factories.client();
    const two = await factories.client();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);

    for (const client of [one, two]) {
      const res = await request(app)
        .post('/api/v1/subscriptions')
        .set('Authorization', `Bearer ${token}`)
        .send(bodyFor(client.id, product.id));
      expect(res.status).toBe(201);
    }

    const list = await request(app)
      .get(`/api/v1/subscriptions?productId=${product.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expectMatchesOperation(list, 'listSubscriptions');
    expect(list.body.data).toHaveLength(2);
  });

  it('T-HU06 — activar es un paso aparte; transición inválida y versión vieja', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);

    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyFor(client.id, product.id));
    const id = created.body.id as string;

    const activated = await request(app)
      .post(`/api/v1/subscriptions/${id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1 });
    expect(activated.status).toBe(200);
    expect(activated.body.status).toBe('active');

    const again = await request(app)
      .post(`/api/v1/subscriptions/${id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2 });
    expect(again.status).toBe(422);
    expect(again.body.code).toBe('invalid_state_transition');

    const stale = await request(app)
      .post(`/api/v1/subscriptions/${id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('version_conflict');
  });

  it('T-HU06 — PATCH con versión vieja ⇒ 409', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);

    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyFor(client.id, product.id));
    const id = created.body.id as string;

    const first = await request(app)
      .patch(`/api/v1/subscriptions/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, notes: 'primera' });
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(2);

    const stale = await request(app)
      .patch(`/api/v1/subscriptions/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, notes: 'vieja' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('version_conflict');
  });

  it('T-HU06 — cancelar: operator 403, admin 200 con fecha y motivo', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const admin = await factories.adminUser();
    const opToken = await factories.tokenFor(operator);
    const adminToken = await factories.tokenFor(admin);

    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${opToken}`)
      .send(bodyFor(client.id, product.id));
    const id = created.body.id as string;

    const forbidden = await request(app)
      .post(`/api/v1/subscriptions/${id}/cancel`)
      .set('Authorization', `Bearer ${opToken}`)
      .send({ version: 1, reason: 'Fin de contrato' });
    expect(forbidden.status).toBe(403);

    const cancelled = await request(app)
      .post(`/api/v1/subscriptions/${id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ version: 1, reason: 'Fin de contrato' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect(cancelled.body.cancelledAt).not.toBeNull();
    expect(cancelled.body.cancellationReason).toBe('Fin de contrato');
  });

  it('T-HU06 — usuario client recibe 403 en /subscriptions', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const clientUser = await factories.clientUser(client);
    const token = await factories.tokenFor(clientUser);

    expect(
      (await request(app).get('/api/v1/subscriptions').set('Authorization', `Bearer ${token}`))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/subscriptions')
          .set('Authorization', `Bearer ${token}`)
          .send(bodyFor(client.id, '00000000-0000-4000-8000-000000000000'))
      ).status,
    ).toBe(403);
  });

  it('T-HU07 — renew crea el periodo siguiente y el historial va del más reciente al más antiguo', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);

    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyFor(client.id, product.id));
    const id = created.body.id as string;

    await request(app)
      .post(`/api/v1/subscriptions/${id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1 })
      .expect(200);

    const renewed = await request(app)
      .post(`/api/v1/subscriptions/${id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2, newPeriod: { priceAmount: '120000.00' } });
    expect(renewed.status).toBe(200);
    expect(renewed.body.currentPeriodEnd).toBe('2026-12-31');
    expect(renewed.body.currentPeriod.priceAmount).toBe('120000.00');

    const periods = await request(app)
      .get(`/api/v1/subscriptions/${id}/periods`)
      .set('Authorization', `Bearer ${token}`);
    expect(periods.status).toBe(200);
    expectMatchesOperation(periods, 'listSubscriptionPeriods');
    expect(periods.body.data).toHaveLength(2);
    expect(periods.body.data[0].periodNumber).toBe(2);
    expect(periods.body.data[0].startDate).toBe('2026-12-01');
    expect(periods.body.data[1].periodNumber).toBe(1);
    expect(periods.body.data[1].renewalOutcome).toBe('renewed');
  });

  it('T-HU07 — renew exige una suscripción activada', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);

    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyFor(client.id, product.id));

    const res = await request(app)
      .post(`/api/v1/subscriptions/${created.body.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, newPeriod: { priceAmount: '120000.00' } });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('invalid_state_transition');
  });

  it('T-HU07 — RN-06: renew no admite paymentStatus received; operador no fija costo', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);

    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyFor(client.id, product.id));
    const id = created.body.id as string;
    await request(app)
      .post(`/api/v1/subscriptions/${id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1 })
      .expect(200);

    const received = await request(app)
      .post(`/api/v1/subscriptions/${id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2, newPeriod: { priceAmount: '120000.00', paymentStatus: 'received' } });
    expect(received.status).toBe(400);
    expect(received.body.code).toBe('validation_error');

    const cost = await request(app)
      .post(`/api/v1/subscriptions/${id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2, newPeriod: { priceAmount: '120000.00', supplierCostAmount: '10.00' } });
    expect(cost.status).toBe(403);
  });
});
