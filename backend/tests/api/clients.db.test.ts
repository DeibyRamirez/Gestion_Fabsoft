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

describe.skipIf(!dbTestsConfigured())('Clients API (Postgres)', () => {
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

  it('T-HU03 — CRUD: admin crea, lista, obtiene y actualiza', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);

    const create = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Nueva Empresa S.A.S.', taxId: '800111222-3', status: 'active' });
    expect(create.status).toBe(201);
    expect(create.headers.location).toMatch(/\/api\/v1\/clients\//);
    expectMatchesOperation(create, 'createClient');
    const id = create.body.id as string;

    const list = await request(app).get('/api/v1/clients').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((c: { id: string }) => c.id === id)).toBe(true);

    const get = await request(app)
      .get(`/api/v1/clients/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expectMatchesOperation(get, 'getClient');
    expect(get.body.summary).toBeUndefined();
    expect(get.body.contacts).toBeUndefined();

    const patch = await request(app)
      .patch(`/api/v1/clients/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' });
    expect(patch.status).toBe(200);
    expect(patch.body.status).toBe('inactive');
  });

  it('T-HU03 — operador lee y escribe; client recibe 403 en /clients', async () => {
    const app = await buildTestApp();
    const clientRow = await factories.client();
    const operator = await factories.operatorUser();
    const clientUser = await factories.clientUser(clientRow);
    const opToken = await factories.tokenFor(operator);
    const clientToken = await factories.tokenFor(clientUser);

    expect(
      (await request(app).get('/api/v1/clients').set('Authorization', `Bearer ${opToken}`)).status,
    ).toBe(200);

    expect(
      (
        await request(app)
          .post('/api/v1/clients')
          .set('Authorization', `Bearer ${opToken}`)
          .send({ legalName: 'Operador Alta', status: 'active' })
      ).status,
    ).toBe(201);

    const clientList = await request(app)
      .get('/api/v1/clients')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(clientList.status).toBe(403);
    expect(clientList.body.code).toBe('forbidden');

    expect(
      (
        await request(app)
          .post('/api/v1/clients')
          .set('Authorization', `Bearer ${clientToken}`)
          .send({ legalName: 'X', status: 'active' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/api/v1/clients/${clientRow.id}`)
          .set('Authorization', `Bearer ${clientToken}`)
          .send({ legalName: 'Hack' })
      ).status,
    ).toBe(403);
  });

  it('T-HU03 — 409 client_tax_id_taken con existingClientId y archived', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const existing = await factories.client({ status: 'archived' });

    const dup = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Duplicado', taxId: existing.taxId, status: 'active' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('client_tax_id_taken');
    expect(dup.body.existingClientId).toBe(existing.id);
    expect(dup.body.archived).toBe(true);
  });

  it('T-HU03 — búsqueda por q y taxId', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const created = await factories.client();
    const byTax = await request(app)
      .get(`/api/v1/clients?taxId=${encodeURIComponent(created.taxId!)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(byTax.status).toBe(200);
    expect(byTax.body.data).toHaveLength(1);

    const byQ = await request(app)
      .get(`/api/v1/clients?q=${encodeURIComponent(created.legalName.slice(0, 8))}`)
      .set('Authorization', `Bearer ${token}`);
    expect(byQ.status).toBe(200);
    expect(byQ.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('T-HU03 — archivar y reactivar (admin)', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const operator = await factories.operatorUser();
    const row = await factories.client();
    const adminToken = await factories.tokenFor(admin);
    const opToken = await factories.tokenFor(operator);

    expect(
      (
        await request(app)
          .post(`/api/v1/clients/${row.id}/archive`)
          .set('Authorization', `Bearer ${opToken}`)
          .send({ reason: 'Cierre comercial' })
      ).status,
    ).toBe(403);

    const archived = await request(app)
      .post(`/api/v1/clients/${row.id}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Cierre comercial' });
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('archived');

    const reactivated = await request(app)
      .post(`/api/v1/clients/${row.id}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.status).toBe('active');
  });

  it('T-HU03 — PATCH en archivado devuelve client_archived', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const row = await factories.client({ status: 'archived' });

    const patch = await request(app)
      .patch(`/api/v1/clients/${row.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'No debe aplicar' });
    expect(patch.status).toBe(422);
    expect(patch.body.code).toBe('client_archived');
  });

  it('T-HU03 — idempotency en POST /clients', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const key = randomUUID();
    const body = { legalName: `Idem ${randomUUID().slice(0, 8)}`, status: 'active' as const };

    const a = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(body);
    const b = await request(app)
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
  });
});