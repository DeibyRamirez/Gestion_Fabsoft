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

/** T-RN01 — NIT duplicado normalizado (mismo valor que seed Andina `900.123.456-7`). */
describe.skipIf(!dbTestsConfigured())('T-RN01 duplicate tax id', () => {
  let factories: Factories;

  beforeAll(async () => {
    factories = createFactories({ tokens: await getTestAccessTokens() });
  });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Distribuidora Andina S.A.S.', taxId: '900.123.456-7', status: 'activo' });
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  it.each(['900123456-7', '900.123.456-7'])(
    'POST %s responde 409 client_tax_id_taken',
    async (taxId) => {
      const app = await buildTestApp();
      const admin = await factories.adminUser();
      const token = await factories.tokenFor(admin);
      const res = await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${token}`)
        .send({ legalName: 'Conflicto NIT', taxId, status: 'activo' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('client_tax_id_taken');
      expect(res.body.existingClientId).toBeTruthy();
    },
  );
});
