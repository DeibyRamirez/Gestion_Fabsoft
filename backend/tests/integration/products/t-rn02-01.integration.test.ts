import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFactories } from '../../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
  withOwnerSystemContext,
} from '../../helpers/db.js';

assertDbTestsRequired();

/** T-RN02-01 — un producto puede tener muchas suscripciones (RN-02). */
describe.skipIf(!dbTestsConfigured())('T-RN02-01 producto con múltiples suscripciones', () => {
  const factories = createFactories();

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestPools();
  });

  it('permite dos suscripciones del mismo producto en clientes distintos y en el mismo cliente', async () => {
    const product = await factories.product();
    const clientA = await factories.client();
    const clientB = await factories.client();

    const subA = await factories.subscription(clientA, product);
    const subB = await factories.subscription(clientB, product);
    const subSameClient = await factories.subscription(clientA, product);

    const rows = await withOwnerSystemContext(async (c) => {
      const { rows: r } = await c.query<{ id: string; product_id: string }>(
        `select id, product_id from app.subscriptions where product_id = $1 order by id`,
        [product.id],
      );
      return r;
    });

    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.id))).toEqual(
      new Set([subA.id, subB.id, subSameClient.id]),
    );
    expect(rows.every((r) => r.product_id === product.id)).toBe(true);
  });
});
