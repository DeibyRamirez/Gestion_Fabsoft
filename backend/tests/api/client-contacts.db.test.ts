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

describe.skipIf(!dbTestsConfigured())('Client contacts API (Postgres)', () => {
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

  it('T-HU04 — el primer contacto queda como principal', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const client = await factories.client();

    const create = await request(app)
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Ana Pérez', email: 'ana@acme.test' });
    expect(create.status).toBe(201);
    expect(create.headers.location).toMatch(/\/api\/v1\/clients\/.+\/contacts\/.+/);
    expectMatchesOperation(create, 'createClientContact');
    expect(create.body.isPrimary).toBe(true);

    const list = await request(app)
      .get(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expectMatchesOperation(list, 'listClientContacts');
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].isPrimary).toBe(true);
  });

  it('T-HU04 — cambiar el principal deja exactamente uno', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const client = await factories.client();

    const first = await request(app)
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Ana Pérez', email: 'ana@acme.test' });
    const second = await request(app)
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Luis Gómez', phone: '3001234567', isPrimary: true });
    expect(second.status).toBe(201);
    expect(second.body.isPrimary).toBe(true);

    const patch = await request(app)
      .patch(`/api/v1/clients/${client.id}/contacts/${second.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPrimary: true });
    expect(patch.status).toBe(200);
    expectMatchesOperation(patch, 'updateClientContact');
    expect(patch.body.isPrimary).toBe(true);

    const list = await request(app)
      .get(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`);
    const primaries = list.body.data.filter((c: { isPrimary: boolean }) => c.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].id).toBe(second.body.id);
    expect(list.body.data.find((c: { id: string }) => c.id === first.body.id).isPrimary).toBe(
      false,
    );
  });

  it('T-HU04 — email inválido y contacto sin canal devuelven 400', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const client = await factories.client();

    const badEmail = await request(app)
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Correo malo', email: 'no-es-email' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.code).toBe('validation_error');

    const unreachable = await request(app)
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Sin canal' });
    expect(unreachable.status).toBe(400);
    expect(unreachable.body.code).toBe('validation_error');
  });

  it('T-RN16-03 — archivar el principal sin reemplazo devuelve 409', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const client = await factories.client();

    const primary = await request(app)
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Ana Pérez', email: 'ana@acme.test' });
    const other = await request(app)
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Luis Gómez', email: 'luis@acme.test' });

    const blocked = await request(app)
      .patch(`/api/v1/clients/${client.id}/contacts/${primary.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ archived: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('primary_contact_conflict');

    await request(app)
      .patch(`/api/v1/clients/${client.id}/contacts/${other.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPrimary: true })
      .expect(200);

    const archived = await request(app)
      .patch(`/api/v1/clients/${client.id}/contacts/${primary.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ archived: true });
    expect(archived.status).toBe(200);
    expect(archived.body.archivedAt).not.toBeNull();

    const visible = await request(app)
      .get(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`);
    expect(visible.body.data).toHaveLength(1);

    const all = await request(app)
      .get(`/api/v1/clients/${client.id}/contacts?includeArchived=true`)
      .set('Authorization', `Bearer ${token}`);
    expect(all.body.data).toHaveLength(2);
  });

  it('T-HU04 — operador escribe; client recibe 403', async () => {
    const app = await buildTestApp();
    const operator = await factories.operatorUser();
    const opToken = await factories.tokenFor(operator);
    const client = await factories.client();
    const clientUser = await factories.clientUser(client);
    const clientToken = await factories.tokenFor(clientUser);

    const created = await request(app)
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${opToken}`)
      .send({ fullName: 'Operador Alta', email: 'op@acme.test' });
    expect(created.status).toBe(201);

    expect(
      (
        await request(app)
          .get(`/api/v1/clients/${client.id}/contacts`)
          .set('Authorization', `Bearer ${clientToken}`)
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .post(`/api/v1/clients/${client.id}/contacts`)
          .set('Authorization', `Bearer ${clientToken}`)
          .send({ fullName: 'Intruso', email: 'x@acme.test' })
      ).status,
    ).toBe(403);
  });
});
