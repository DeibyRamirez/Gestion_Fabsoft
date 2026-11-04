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
import { expectMatchesOperation } from '../helpers/openapi.js';

assertDbTestsRequired();

describe.skipIf(!dbTestsConfigured())('Products API (Postgres)', () => {
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

  it('CRUD: admin crea, lista, obtiene y actualiza', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);

    const create = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Microsoft 365', productType: 'third_party', vendor: 'Microsoft' });
    expect(create.status).toBe(201);
    expectMatchesOperation(create, 'createProduct');
    const id = create.body.id as string;

    const list = await request(app).get('/api/v1/products').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const get = await request(app)
      .get(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expectMatchesOperation(get, 'getProduct');

    const patch = await request(app)
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe('inactive');
  });

  it('operador lee y client recibe 403 al leer', async () => {
    const app = await buildTestApp();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const client = await factories.client();
    const clientUser = await factories.clientUser(client);

    const opList = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${await factories.tokenFor(operator)}`);
    expect(opList.status).toBe(200);

    const clientList = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${await factories.tokenFor(clientUser)}`);
    expect(clientList.status).toBe(403);
    expect(clientList.body.code).toBe('forbidden');

    expect(
      (
        await request(app)
          .get(`/api/v1/products/${product.id}`)
          .set('Authorization', `Bearer ${await factories.tokenFor(clientUser)}`)
      ).status,
    ).toBe(403);
  });

  it('operador y client reciben 403 al escribir', async () => {
    const app = await buildTestApp();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const client = await factories.client();
    const clientUser = await factories.clientUser(client);
    const opToken = await factories.tokenFor(operator);
    const clientToken = await factories.tokenFor(clientUser);

    expect(
      (
        await request(app)
          .post('/api/v1/products')
          .set('Authorization', `Bearer ${opToken}`)
          .send({ name: 'Nuevo', productType: 'own' })
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .patch(`/api/v1/products/${product.id}`)
          .set('Authorization', `Bearer ${opToken}`)
          .send({ name: 'Cambio' })
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .post('/api/v1/products')
          .set('Authorization', `Bearer ${clientToken}`)
          .send({ name: 'Nuevo', productType: 'own' })
      ).status,
    ).toBe(403);
  });

  it('409 duplicate_product por nombre+vendor', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const body = { name: 'Duplicado', productType: 'own', vendor: 'Fab' };

    expect(
      (
        await request(app)
          .post('/api/v1/products')
          .set('Authorization', `Bearer ${token}`)
          .send(body)
      ).status,
    ).toBe(201);

    const dup = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('duplicate_product');
    expectMatchesOperation(dup, 'createProduct');
  });

  it('GET filtra por status', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    await factories.product({ status: 'active' });
    await factories.product({ status: 'inactive' });

    const res = await request(app)
      .get('/api/v1/products?status=inactive')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: { status: string }) => p.status === 'inactive')).toBe(true);
    expect(res.body.meta.total).toBe(1);
  });
});
