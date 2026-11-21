import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProblemSchema, SettingsSchema } from '@fabsoft/shared';
import { createFactories, type Factories, type FactoryUser } from '../fixtures/factories.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../helpers/app.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
} from '../helpers/db.js';
import { expectMatchesOperation } from '../helpers/openapi.js';

assertDbTestsRequired();

describe.skipIf(!dbTestsConfigured())('Settings API (Postgres)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let factories: Factories;
  let admin: FactoryUser;
  let operator: FactoryUser;
  let client: FactoryUser;
  let adminToken: string;
  let operatorToken: string;
  let clientToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await buildTestApp();
    factories = createFactories({ tokens: await getTestAccessTokens() });
  });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
    admin = await factories.adminUser();
    operator = await factories.operatorUser();
    const clientRow = await factories.client();
    client = await factories.user({ role: 'client', clientId: clientRow.id });
    adminToken = await factories.tokenFor(admin);
    operatorToken = await factories.tokenFor(operator);
    clientToken = await factories.tokenFor(client);
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  it('GET devuelve la configuración por defecto para admin/operator y 403 para cliente', async () => {
    const adminRes = await request(app).get('/api/v1/settings').set(auth(adminToken));
    expect(adminRes.status).toBe(200);
    expectMatchesOperation(adminRes, 'getSettings');
    expect(SettingsSchema.parse(adminRes.body).contactChannel).toEqual({
      email: null,
      phone: null,
      hours: null,
    });

    expect((await request(app).get('/api/v1/settings').set(auth(operatorToken))).status).toBe(200);
    expect((await request(app).get('/api/v1/settings').set(auth(clientToken))).status).toBe(403);
  });

  it('PATCH actualiza el canal de contacto, audita before/after y se refleja en GET', async () => {
    const channel = {
      email: 'soporte@fabsoft.test',
      phone: '+57 300 123 4567',
      hours: 'Lunes a viernes, 8:00-17:00 (hora Colombia)',
    };

    const updated = await request(app)
      .patch('/api/v1/settings')
      .set(auth(adminToken))
      .send({ contactChannel: channel });
    expect(updated.status).toBe(200);
    expectMatchesOperation(updated, 'updateSettings');
    expect(SettingsSchema.parse(updated.body).contactChannel).toEqual(channel);

    const after = await request(app).get('/api/v1/settings').set(auth(operatorToken));
    expect(after.status).toBe(200);
    expect(after.body.contactChannel).toEqual(channel);

    const audit = await request(app)
      .get('/api/v1/audit-logs?action=app_setting.updated')
      .set(auth(adminToken));
    expect(audit.status).toBe(200);
    expect(audit.body.data).toHaveLength(1);
    expect(audit.body.data[0].resourceId).toBe('contact_channel');
    expect(audit.body.data[0].changes.before.value).toEqual({
      email: null,
      phone: null,
      hours: null,
    });
    expect(audit.body.data[0].changes.after.value).toEqual(channel);
  });

  it('valida correo, campos desconocidos y limpieza con null', async () => {
    const invalidEmail = await request(app)
      .patch('/api/v1/settings')
      .set(auth(adminToken))
      .send({ contactChannel: { email: 'no-es-correo', phone: null, hours: null } });
    expect(invalidEmail.status).toBe(400);
    expect(ProblemSchema.parse(invalidEmail.body).code).toBe('validation_error');

    const unknownField = await request(app)
      .patch('/api/v1/settings')
      .set(auth(adminToken))
      .send({ contactChannel: { email: null, phone: null, hours: null, extra: 'x' } });
    expect(unknownField.status).toBe(400);
    expect(ProblemSchema.parse(unknownField.body).code).toBe('validation_error');

    const emptyStrings = await request(app)
      .patch('/api/v1/settings')
      .set(auth(adminToken))
      .send({ contactChannel: { email: '', phone: '  ', hours: '' } });
    expect(emptyStrings.status).toBe(200);
    expect(emptyStrings.body.contactChannel).toEqual({ email: null, phone: null, hours: null });
  });

  it('operator lee pero no edita; cliente no accede', async () => {
    expect(
      (
        await request(app)
          .patch('/api/v1/settings')
          .set(auth(operatorToken))
          .send({ contactChannel: { email: null, phone: null, hours: null } })
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .patch('/api/v1/settings')
          .set(auth(clientToken))
          .send({ contactChannel: { email: null, phone: null, hours: null } })
      ).status,
    ).toBe(403);
  });
});
