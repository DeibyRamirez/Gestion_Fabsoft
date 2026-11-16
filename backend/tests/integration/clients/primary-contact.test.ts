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

/** T-RN16-01..03 — exactamente un contacto principal por cliente. */
describe.skipIf(!dbTestsConfigured())('T-RN16 primary contact', () => {
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

  it('T-RN16-01 — dos contactos principales fallan en la BD', async () => {
    const client = await factories.client();
    const admin = await factories.adminUser();
    await factories.contact(client, { isPrimary: true });

    await expect(
      withAppContext({ role: 'admin', userId: admin.id, clientId: null }, async (c) => {
        await c.query(
          `insert into app.client_contacts (client_id, full_name, email, is_primary)
           values ($1, 'Segundo principal', 'segundo@acme.test', true)`,
          [client.id],
        );
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('T-RN16-02 — cambiar el principal deja exactamente uno', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);

    const first = await request(app)
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Ana Pérez', email: 'ana@acme.test' });
    const second = await request(app)
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Luis Gómez', email: 'luis@acme.test' });
    expect(first.body.isPrimary).toBe(true);
    expect(second.body.isPrimary).toBe(false);

    await request(app)
      .patch(`/api/v1/clients/${client.id}/contacts/${second.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPrimary: true })
      .expect(200);

    const rows = await withAppContext(
      { role: 'admin', userId: admin.id, clientId: null, requestId: 't-rn16-02' },
      async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `select id from app.client_contacts
            where client_id = $1 and is_primary and archived_at is null`,
          [client.id],
        );
        return rows;
      },
    );
    expect(rows.map((r) => r.id)).toEqual([second.body.id]);
  });

  it('T-RN16-03 — archivar el principal sin reemplazo devuelve 409', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);

    const primary = await request(app)
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Ana Pérez', email: 'ana@acme.test' });
    await request(app)
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Luis Gómez', email: 'luis@acme.test' });

    const res = await request(app)
      .patch(`/api/v1/clients/${client.id}/contacts/${primary.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ archived: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('primary_contact_conflict');
  });
});
