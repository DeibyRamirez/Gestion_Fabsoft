import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFactories, type Factories } from '../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
} from '../helpers/db.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../helpers/app.js';
import { assertInvalidComponentSchema, assertValidComponentSchema } from '../helpers/openapi.js';

assertDbTestsRequired();

describe('contrato OpenAPI — productos', () => {
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

  describe.skipIf(!dbTestsConfigured())('T-HU05-03 — campos de precio rechazados en API', () => {
    it('POST /api/v1/products con priceAmount responde 400 validation_error', async () => {
      const app = await buildTestApp();
      const admin = await factories.adminUser();
      const token = await factories.tokenFor(admin);

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Con precio',
          productType: 'own',
          priceAmount: '100000.00',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('validation_error');
    });

    it('POST /api/v1/products con billingCycle responde 400 validation_error', async () => {
      const app = await buildTestApp();
      const admin = await factories.adminUser();
      const token = await factories.tokenFor(admin);

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Con ciclo',
          productType: 'own',
          billingCycle: 'monthly',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('validation_error');
    });

    it('POST /api/v1/products con price responde 400 validation_error', async () => {
      const app = await buildTestApp();
      const admin = await factories.adminUser();
      const token = await factories.tokenFor(admin);

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Con price',
          productType: 'own',
          price: 1000,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('validation_error');
    });

    it('PATCH /api/v1/products/{id} con priceAmount responde 400 validation_error', async () => {
      const app = await buildTestApp();
      const product = await factories.product();
      const admin = await factories.adminUser();
      const token = await factories.tokenFor(admin);

      const res = await request(app)
        .patch(`/api/v1/products/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ priceAmount: '100000.00' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('validation_error');
    });

    it('PATCH /api/v1/products/{id} con billingCycle responde 400 validation_error', async () => {
      const app = await buildTestApp();
      const product = await factories.product();
      const admin = await factories.adminUser();
      const token = await factories.tokenFor(admin);

      const res = await request(app)
        .patch(`/api/v1/products/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ billingCycle: 'annual' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('validation_error');
    });

    it('PATCH /api/v1/products/{id} con price responde 400 validation_error', async () => {
      const app = await buildTestApp();
      const product = await factories.product();
      const admin = await factories.adminUser();
      const token = await factories.tokenFor(admin);

      const res = await request(app)
        .patch(`/api/v1/products/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ price: 999 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('validation_error');
    });
  });

  describe('T-HU05-08 — esquemas Product* con additionalProperties:false', () => {
    it('ProductCreate sin campos de precio es válido en OpenAPI', () => {
      assertValidComponentSchema('ProductCreate', {
        name: 'Solo catálogo',
        productType: 'recurring_service',
      });
    });

    it('ProductUpdate sin campos de precio es válido en OpenAPI', () => {
      assertValidComponentSchema('ProductUpdate', { status: 'inactive' });
    });

    it('Product no admite priceAmount en el contrato', () => {
      assertInvalidComponentSchema('Product', {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'X',
        productType: 'own',
        status: 'active',
        createdAt: '2026-11-01T12:00:00.000Z',
        updatedAt: '2026-11-01T12:00:00.000Z',
        priceAmount: '1.00',
      });
    });
  });
});
