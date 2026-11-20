import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  IntegrationPageSchema,
  IntegrationSchema,
  type IntegrationManifest,
} from '@fabsoft/shared';
import { createFactories, type Factories, type FactoryUser } from '../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
} from '../helpers/db.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../helpers/app.js';
import { expectMatchesOperation } from '../helpers/openapi.js';

assertDbTestsRequired();

describe.skipIf(!dbTestsConfigured())('Integrations API (Postgres)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let factories: Factories;
  let admin: FactoryUser;
  let operator: FactoryUser;
  let clientUser: FactoryUser;
  let adminToken: string;
  let operatorToken: string;
  let clientToken: string;
  let clientId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const manifest = (over: Partial<IntegrationManifest> = {}): IntegrationManifest => ({
    manifest_schema_version: 1,
    integration: `erp-${randomUUID().slice(0, 8)}`,
    version: '1.0.0',
    display_name: 'ERP contable',
    description: 'Integración de prueba',
    scopes: ['clients:read', 'subscriptions:read', 'renewal-requests:write'],
    client_scope: 'own',
    client_ids: [clientId],
    rate_limit_per_minute: 100,
    credential_ttl_days: 30,
    ...over,
  });

  beforeAll(async () => {
    app = await buildTestApp();
    factories = createFactories({ tokens: await getTestAccessTokens() });
  });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
    admin = await factories.adminUser();
    operator = await factories.operatorUser();
    const client = await factories.client({ status: 'activo' });
    clientId = client.id;
    clientUser = await factories.user({ role: 'client', clientId });
    adminToken = await factories.tokenFor(admin);
    operatorToken = await factories.tokenFor(operator);
    clientToken = await factories.tokenFor(clientUser);
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  it('T-INT-01 — admin crea, lista, consulta y actualiza una integración', async () => {
    const createManifest = manifest();
    const created = await request(app)
      .post('/api/v1/integrations')
      .set(auth(adminToken))
      .send({ manifest: createManifest });
    expect(created.status).toBe(201);
    expectMatchesOperation(created, 'createIntegration');
    const dto = IntegrationSchema.parse(created.body);
    expect(dto).toMatchObject({
      name: 'ERP contable',
      status: 'activa',
      clientScope: 'own',
      clientIds: [clientId],
      rateLimitPerMinute: 100,
    });
    expect(dto.slug).toMatch(/^erp-/);

    const duplicate = await request(app)
      .post('/api/v1/integrations')
      .set(auth(adminToken))
      .send({ manifest: createManifest });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('duplicate_integration');

    const list = await request(app).get('/api/v1/integrations').set(auth(adminToken));
    expect(list.status).toBe(200);
    expectMatchesOperation(list, 'listIntegrations');
    expect(IntegrationPageSchema.parse(list.body).meta.total).toBe(1);

    const get = await request(app).get(`/api/v1/integrations/${dto.id}`).set(auth(adminToken));
    expect(get.status).toBe(200);
    expectMatchesOperation(get, 'getIntegration');

    const patch = await request(app)
      .patch(`/api/v1/integrations/${dto.id}`)
      .set(auth(adminToken))
      .send({ status: 'deshabilitada', name: 'ERP deshabilitado' });
    expect(patch.status).toBe(200);
    expectMatchesOperation(patch, 'updateIntegration');
    expect(patch.body).toMatchObject({ status: 'deshabilitada', name: 'ERP deshabilitado' });
  });

  it('T-INT-01 — sustituye manifest con semver creciente y valida clientes', async () => {
    const base = manifest();
    const created = await request(app)
      .post('/api/v1/integrations')
      .set(auth(adminToken))
      .send({ manifest: base });
    const id = created.body.id as string;

    const updated = await request(app)
      .put(`/api/v1/integrations/${id}/manifest`)
      .set(auth(adminToken))
      .send({ ...base, version: '1.1.0', scopes: ['clients:read'], rate_limit_per_minute: 120 });
    expect(updated.status).toBe(200);
    expectMatchesOperation(updated, 'replaceIntegrationManifest');
    expect(updated.body).toMatchObject({
      manifestVersion: '1.1.0',
      rateLimitPerMinute: 120,
      scopes: ['clients:read'],
    });

    const oldVersion = await request(app)
      .put(`/api/v1/integrations/${id}/manifest`)
      .set(auth(adminToken))
      .send({ ...base, version: '1.0.0' });
    expect(oldVersion.status).toBe(422);
    expect(oldVersion.body.code).toBe('manifest_invalid');

    const archived = await factories.client({ status: 'archivado' });
    const invalidClient = await request(app)
      .put(`/api/v1/integrations/${id}/manifest`)
      .set(auth(adminToken))
      .send({
        ...base,
        version: '1.2.0',
        client_ids: [archived.id],
      });
    expect(invalidClient.status).toBe(422);
    expect(invalidClient.body.code).toBe('manifest_invalid');
  });

  it('T-API-01/02 — emite, lista, limita y revoca credenciales', async () => {
    const created = await request(app)
      .post('/api/v1/integrations')
      .set(auth(adminToken))
      .send({ manifest: manifest() });
    const id = created.body.id as string;

    const first = await request(app)
      .post(`/api/v1/integrations/${id}/credentials`)
      .set(auth(adminToken))
      .send({ label: 'ERP principal' });
    expect(first.status).toBe(201);
    expectMatchesOperation(first, 'createIntegrationCredential');
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body.apiKey).toMatch(/^fsk_test_[a-z0-9]{8}_/);
    expect(first.body.keyPrefix).toMatch(/^fsk_test_[a-z0-9]{8}$/);

    const second = await request(app)
      .post(`/api/v1/integrations/${id}/credentials`)
      .set(auth(adminToken))
      .send({});
    expect(second.status).toBe(201);

    const third = await request(app)
      .post(`/api/v1/integrations/${id}/credentials`)
      .set(auth(adminToken))
      .send({});
    expect(third.status).toBe(422);
    expect(third.body.code).toBe('credential_limit_reached');

    const list = await request(app)
      .get(`/api/v1/integrations/${id}/credentials`)
      .set(auth(adminToken));
    expect(list.status).toBe(200);
    expectMatchesOperation(list, 'listIntegrationCredentials');
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.some((c: { apiKey?: string }) => c.apiKey !== undefined)).toBe(false);

    const revoked = await request(app)
      .post(`/api/v1/integrations/${id}/credentials/${first.body.id}/revoke`)
      .set(auth(adminToken));
    expect(revoked.status).toBe(200);
    expectMatchesOperation(revoked, 'revokeIntegrationCredential');
    expect(revoked.body.revokedAt).not.toBeNull();
  });

  it('integraciones: sólo admin; operador y cliente reciben 403', async () => {
    expect((await request(app).get('/api/v1/integrations').set(auth(operatorToken))).status).toBe(
      403,
    );
    expect((await request(app).get('/api/v1/integrations').set(auth(clientToken))).status).toBe(
      403,
    );
  });
});
