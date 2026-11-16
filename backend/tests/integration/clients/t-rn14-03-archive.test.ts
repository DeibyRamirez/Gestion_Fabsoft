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

/** T-RN14-03 — archivar cliente conserva suscripciones consultables. */
describe.skipIf(!dbTestsConfigured())('T-RN14-03 archive client history', () => {
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

  it('archivar no borra suscripciones del cliente', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const sub = await factories.subscription(client, product);
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);

    const archived = await request(app)
      .post(`/api/v1/clients/${client.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Fin de relación comercial' });
    expect(archived.status).toBe(200);

    const rows = await withAppContext(
      { role: 'admin', userId: admin.id, clientId: null, requestId: 't-rn14-03' },
      async (c) => {
        const { rows: r } = await c.query<{ id: string }>(
          `select id from app.subscriptions where client_id = $1`,
          [client.id],
        );
        return r;
      },
    );
    expect(rows.map((r) => r.id)).toContain(sub.id);
  });
});
