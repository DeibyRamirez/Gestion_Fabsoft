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
    expect(res.body.status).toBe('pendiente_activacion');
    expect(res.body.currentPeriodEnd).toBe('2026-11-30');
    expect(res.body.priceAmount).toBe('100000.00');
    expect(res.body.currentPeriod.periodNumber).toBe(1);
    expect(res.body.currentPeriod.endDate).toBe('2026-11-30');
    expect(res.body.currentPeriod.priceAmount).toBe('100000.00');
  });

  it('T-HU16 — exporta el listado filtrado de suscripciones a CSV UTF-8', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);

    await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyFor(client.id, product.id))
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/subscriptions/export?clientId=${client.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text.startsWith('\uFEFF')).toBe(true);
    expect(res.text).toContain('"Cliente"');
    expect(res.text).toContain(client.legalName);
    expect(res.text).toContain(product.name);
  });

  it('T-HU06 — cliente archivado y producto inactivo ⇒ 422', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const activeClient = await factories.client();
    const activeProduct = await factories.product();
    const archivedClient = await factories.client({ status: 'archivado' });
    const inactiveProduct = await factories.product({ status: 'inactivo' });

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
    expect(activated.body.status).toBe('activa');

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
    expect(cancelled.body.status).toBe('cancelada');
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
    expect(periods.body.data[1].renewalOutcome).toBe('renovada');
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

  it('T-HU07 — RN-06: renew no admite paymentStatus recibido; operador no fija costo', async () => {
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
      .send({ version: 2, newPeriod: { priceAmount: '120000.00', paymentStatus: 'recibido' } });
    expect(received.status).toBe(400);
    expect(received.body.code).toBe('validation_error');

    const cost = await request(app)
      .post(`/api/v1/subscriptions/${id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2, newPeriod: { priceAmount: '120000.00', supplierCostAmount: '10.00' } });
    expect(cost.status).toBe(403);
  });

  it('T-HU09-02 — start-renewal: activa→en_renovacion, operador permitido y versión', async () => {
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

    const started = await request(app)
      .post(`/api/v1/subscriptions/${id}/start-renewal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2 });
    expect(started.status).toBe(200);
    expectMatchesOperation(started, 'startSubscriptionRenewal');
    expect(started.body.status).toBe('en_renovacion');
    expect(started.body.followUpStatus).toBe('en_gestion');
    expect(started.body.version).toBe(3);

    const repeated = await request(app)
      .post(`/api/v1/subscriptions/${id}/start-renewal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 3 });
    expect(repeated.status).toBe(422);
    expect(repeated.body.code).toBe('invalid_state_transition');

    const stale = await request(app)
      .post(`/api/v1/subscriptions/${id}/start-renewal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('version_conflict');
  });

  it('T-HU09-02 — not-renewed vigente difiere el estado; vencida lo aplica ya', async () => {
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

    const decision = 'El cliente no renovará';
    const deferred = await request(app)
      .post(`/api/v1/subscriptions/${id}/not-renewed`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2, reason: decision });
    expect(deferred.status).toBe(200);
    expectMatchesOperation(deferred, 'markSubscriptionNotRenewed');
    expect(deferred.body.status).toBe('activa');
    expect(deferred.body.followUpStatus).toBe('cerrado');
    expect(deferred.body.currentPeriod.renewalOutcome).toBe('no_renovada');
    expect(deferred.body.currentPeriod.outcomeReason).toBe(decision);

    const expiredSub = await factories.subscription(client, product, {
      status: 'vencida',
      startDate: '2026-10-01',
    });
    const immediate = await request(app)
      .post(`/api/v1/subscriptions/${expiredSub.id}/not-renewed`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, reason: 'Fin de contrato' });
    expect(immediate.status).toBe(200);
    expect(immediate.body.status).toBe('no_renovada');
    expect(immediate.body.followUpStatus).toBe('cerrado');
    expect(immediate.body.currentPeriod.renewalOutcome).toBe('no_renovada');
  });

  it('T-HU09-02 — correct-expiration actualiza suscripción y periodo con motivo', async () => {
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

    const corrected = await request(app)
      .post(`/api/v1/subscriptions/${id}/correct-expiration`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2, newCurrentPeriodEnd: '2026-12-15', reason: 'Error de captura' });
    expect(corrected.status).toBe(200);
    expectMatchesOperation(corrected, 'correctSubscriptionExpiration');
    expect(corrected.body.currentPeriodEnd).toBe('2026-12-15');
    expect(corrected.body.currentPeriod.endDate).toBe('2026-12-15');
    expect(corrected.body.currentPeriod.paymentStatus).toBe('pendiente');
    expect(corrected.body.version).toBe(3);

    const stale = await request(app)
      .post(`/api/v1/subscriptions/${id}/correct-expiration`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2, newCurrentPeriodEnd: '2026-12-20', reason: 'Otra fecha' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('version_conflict');

    const beforeStart = await request(app)
      .post(`/api/v1/subscriptions/${id}/correct-expiration`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 3, newCurrentPeriodEnd: '2026-10-31', reason: 'Fecha inválida' });
    expect(beforeStart.status).toBe(400);
    expect(beforeStart.body.code).toBe('validation_error');
  });

  it('T-RN07 — el pago se cambia sólo por periodo y no altera la vigencia', async () => {
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
    const periodId = created.body.currentPeriod.id as string;
    await request(app)
      .post(`/api/v1/subscriptions/${id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1 })
      .expect(200);

    const paid = await request(app)
      .patch(`/api/v1/subscriptions/${id}/periods/${periodId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentStatus: 'recibido', contractReference: 'C-2026-11' });
    expect(paid.status).toBe(200);
    expectMatchesOperation(paid, 'updateSubscriptionPeriodPayment');
    expect(paid.body.paymentStatus).toBe('recibido');
    expect(paid.body.contractReference).toBe('C-2026-11');

    const detail = await request(app)
      .get(`/api/v1/subscriptions/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.body.status).toBe('activa');
    expect(detail.body.currentPaymentStatus).toBe('recibido');

    const history = await request(app)
      .get(`/api/v1/subscriptions/${id}/periods`)
      .set('Authorization', `Bearer ${token}`);
    expect(history.body.data[0].paymentStatus).toBe('recibido');

    const expiredSub = await factories.subscription(client, product, {
      status: 'vencida',
      startDate: '2026-10-01',
    });
    const expiredPeriods = await request(app)
      .get(`/api/v1/subscriptions/${expiredSub.id}/periods`)
      .set('Authorization', `Bearer ${token}`);
    const expiredPaid = await request(app)
      .patch(`/api/v1/subscriptions/${expiredSub.id}/periods/${expiredPeriods.body.data[0].id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentStatus: 'recibido' });
    expect(expiredPaid.status).toBe(200);
    const expiredDetail = await request(app)
      .get(`/api/v1/subscriptions/${expiredSub.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(expiredDetail.body.status).toBe('vencida');
    expect(expiredDetail.body.currentPaymentStatus).toBe('recibido');

    const other = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyFor(client.id, product.id));
    const wrongPeriod = await request(app)
      .patch(`/api/v1/subscriptions/${id}/periods/${other.body.currentPeriod.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentStatus: 'pendiente' });
    expect(wrongPeriod.status).toBe(404);
  });

  it('T-RN03/RN04 — renovar conserva el periodo previo y vuelve a followUp none', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);

    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyFor(client.id, product.id, { priceAmount: '100000.00' }));
    const id = created.body.id as string;
    await request(app)
      .post(`/api/v1/subscriptions/${id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1 })
      .expect(200);
    await request(app)
      .post(`/api/v1/subscriptions/${id}/start-renewal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2 })
      .expect(200);

    const renewed = await request(app)
      .post(`/api/v1/subscriptions/${id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 3, newPeriod: { priceAmount: '120000.00' } });
    expect(renewed.status).toBe(200);
    expect(renewed.body.followUpStatus).toBe('sin_gestion');
    expect(renewed.body.currentPeriod.priceAmount).toBe('120000.00');

    const periods = await request(app)
      .get(`/api/v1/subscriptions/${id}/periods`)
      .set('Authorization', `Bearer ${token}`);
    expect(periods.body.data).toHaveLength(2);
    expect(periods.body.data[1].priceAmount).toBe('100000.00');
    expect(periods.body.data[1].renewalOutcome).toBe('renovada');
    expect(periods.body.data[0].priceAmount).toBe('120000.00');
    expect(periods.body.data[0].paymentStatus).toBe('pendiente');
  });
});
