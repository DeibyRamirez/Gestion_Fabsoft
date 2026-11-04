import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFactories, type Factories } from '../../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
  withOwnerSystemContext,
} from '../../helpers/db.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../../helpers/app.js';

assertDbTestsRequired();

/** T-HU05-04 — desactivar producto no altera suscripciones ni periodos; filtro status=active. */
describe.skipIf(!dbTestsConfigured())('T-HU05-04 desactivar producto', () => {
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

  it('inactive un producto con suscripciones y periodos sin cambiarlos', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const client = await factories.client();
    const product = await factories.product({ status: 'active' });
    const subscription = await factories.subscription(client, product, { status: 'active' });
    const extraPeriod = await factories.period(subscription);

    const before = await withOwnerSystemContext(async (c) => {
      const subs = await c.query(
        `select status, price_amount::text from app.subscriptions where id = $1`,
        [subscription.id],
      );
      const periods = await c.query(
        `select period_number, start_date::text, end_date::text, price_amount::text
         from app.subscription_periods where subscription_id = $1 order by period_number`,
        [subscription.id],
      );
      return { sub: subs.rows[0], periods: periods.rows };
    });

    const patch = await request(app)
      .patch(`/api/v1/products/${product.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe('inactive');

    const after = await withOwnerSystemContext(async (c) => {
      const subs = await c.query(
        `select status, price_amount::text from app.subscriptions where id = $1`,
        [subscription.id],
      );
      const periods = await c.query(
        `select period_number, start_date::text, end_date::text, price_amount::text
         from app.subscription_periods where subscription_id = $1 order by period_number`,
        [subscription.id],
      );
      return { sub: subs.rows[0], periods: periods.rows };
    });

    expect(after.sub).toEqual(before.sub);
    expect(after.periods).toEqual(before.periods);
    expect(after.periods).toHaveLength(2);
    expect(after.periods[1]).toMatchObject({
      period_number: extraPeriod.periodNumber,
      start_date: extraPeriod.startDate,
      end_date: extraPeriod.endDate,
    });

    const activeList = await request(app)
      .get('/api/v1/products?status=active')
      .set('Authorization', `Bearer ${token}`);
    expect(activeList.status).toBe(200);
    expect(activeList.body.data.some((p: { id: string }) => p.id === product.id)).toBe(false);

    const inactiveList = await request(app)
      .get('/api/v1/products?status=inactive')
      .set('Authorization', `Bearer ${token}`);
    expect(inactiveList.status).toBe(200);
    expect(inactiveList.body.data.some((p: { id: string }) => p.id === product.id)).toBe(true);
  });
});
