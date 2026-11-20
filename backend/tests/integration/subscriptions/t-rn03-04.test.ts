import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFactories, type Factories } from '../../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
  withAppContext,
} from '../../helpers/db.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../../helpers/app.js';

assertDbTestsRequired();

/** T-RN03-02 / T-RN04-02 / T-RN04-03: invariante de vencimiento e historial inmutable. */
describe.skipIf(!dbTestsConfigured())('T-RN03/RN04 periodos', () => {
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

  async function createRenewedSubscription() {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(operator);

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
    const id = created.body.id as string;

    await request(app)
      .post(`/api/v1/subscriptions/${id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1 })
      .expect(200);
    await request(app)
      .post(`/api/v1/subscriptions/${id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2, newPeriod: { priceAmount: '120000.00' } })
      .expect(200);

    return { app, id, token, admin };
  }

  it('T-RN03-02: current_period_end = max(end_date) tras crear, renovar y corregir', async () => {
    const { app, id, token, admin } = await createRenewedSubscription();

    const readInvariant = () =>
      withAppContext(
        { role: 'admin', userId: admin.id, clientId: null, requestId: 't-rn03-02' },
        async (c) => {
          const { rows } = await c.query<{ ok: boolean }>(
            `select s.current_period_end = max(p.end_date) as ok
               from app.subscriptions s
               join app.subscription_periods p on p.subscription_id = s.id
              where s.id = $1
              group by s.id, s.current_period_end`,
            [id],
          );
          return rows[0]?.ok;
        },
      );

    expect(await readInvariant()).toBe(true);

    const corrected = await request(app)
      .post(`/api/v1/subscriptions/${id}/correct-expiration`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 3, newCurrentPeriodEnd: '2027-01-15', reason: 'Ajuste de contrato' });
    expect(corrected.status).toBe(200);
    expect(await readInvariant()).toBe(true);
  });

  it('T-RN04-02: un periodo histórico no cambia precio ni fecha de fin', async () => {
    const { id, admin } = await createRenewedSubscription();

    await expect(
      withAppContext(
        { role: 'admin', userId: admin.id, clientId: null, requestId: 't-rn04-02-price' },
        async (c) => {
          await c.query(
            `update app.subscription_periods set price_amount = 1
              where subscription_id = $1 and period_number = 1`,
            [id],
          );
        },
      ),
    ).rejects.toMatchObject({ code: 'P0001' });

    await expect(
      withAppContext(
        { role: 'admin', userId: admin.id, clientId: null, requestId: 't-rn04-02-end' },
        async (c) => {
          await c.query(
            `update app.subscription_periods set end_date = '2026-11-15'
              where subscription_id = $1 and period_number = 1`,
            [id],
          );
        },
      ),
    ).rejects.toMatchObject({ code: 'P0001' });
  });

  it('T-RN04-03: insertar un periodo solapado falla con 23P01', async () => {
    const { id, admin } = await createRenewedSubscription();

    await expect(
      withAppContext(
        { role: 'admin', userId: admin.id, clientId: null, requestId: 't-rn04-03' },
        async (c) => {
          await c.query(
            `insert into app.subscription_periods
               (subscription_id, period_number, start_date, end_date, billing_cycle, price_amount)
             values ($1, 99, '2026-11-15', '2026-12-15', 'monthly', 1000)`,
            [id],
          );
        },
      ),
    ).rejects.toMatchObject({ code: '23P01' });
  });
});
