import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createFactories } from '../../fixtures/factories.js';
import { withOwnerSystemContext } from '../../helpers/owner-system.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
} from '../../helpers/db.js';
import { buildTestApp, closeTestApp } from '../../helpers/app.js';

assertDbTestsRequired();

/** T-RN01 — NIT duplicado normalizado (mismo valor que seed Andina `900.123.456-7`). */
describe.skipIf(!dbTestsConfigured())('T-RN01 duplicate tax id', () => {
  const factories = createFactories({ seed: 1 });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
    const andinaNit = '900.123.456-7';
    const seed = await factories.client();
    await withOwnerSystemContext(async (c) => {
      await c.query(`update app.clients set tax_id = $1 where id = $2`, [andinaNit, seed.id]);
    });
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
        .send({ legalName: 'Conflicto NIT', taxId, status: 'active' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('client_tax_id_taken');
      expect(res.body.existingClientId).toBeTruthy();
    },
  );
});