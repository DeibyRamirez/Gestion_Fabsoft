import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiCredentialCreatedSchema,
  IntegrationSchema,
  type IntegrationManifest,
  type RenewalRequestDto,
} from '@fabsoft/shared';
import { toBogotaLocalDate } from '../../src/domain/subscriptions/bogota-date.js';
import {
  createFactories,
  type FactoryClient,
  type FactoryUser,
  type Factories,
} from '../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
} from '../helpers/db.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../helpers/app.js';
import { expectMatchesOperation } from '../helpers/openapi.js';

assertDbTestsRequired();

describe.skipIf(!dbTestsConfigured())('Integration public API (Postgres)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let factories: Factories;
  let admin: FactoryUser;
  let adminToken: string;
  let clientA: FactoryClient;
  let clientB: FactoryClient;
  let subscriptionA: string;
  let subscriptionB: string;
  let productId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = (key: string) => ({ 'X-Api-Key': key });

  const manifest = (over: Partial<IntegrationManifest> = {}): IntegrationManifest => ({
    manifest_schema_version: 1,
    integration: `api-${Math.random().toString(36).slice(2, 10)}`,
    version: '1.0.0',
    display_name: 'Integración API',
    scopes: [
      'clients:read',
      'products:read',
      'subscriptions:read',
      'renewal-requests:read',
      'renewal-requests:write',
      'renewal-tasks:read',
    ],
    client_scope: 'all',
    rate_limit_per_minute: 60,
    ...over,
  });

  async function createIntegration(over: Partial<IntegrationManifest> = {}) {
    const created = await request(app)
      .post('/api/v1/integrations')
      .set(auth(adminToken))
      .send({ manifest: manifest(over) });
    expect(created.status).toBe(201);
    const integration = IntegrationSchema.parse(created.body);
    const key = await request(app)
      .post(`/api/v1/integrations/${integration.id}/credentials`)
      .set(auth(adminToken))
      .send({ label: 'test' });
    expect(key.status).toBe(201);
    return { integration, apiKey: ApiCredentialCreatedSchema.parse(key.body).apiKey };
  }

  beforeAll(async () => {
    app = await buildTestApp();
    factories = createFactories({ tokens: await getTestAccessTokens() });
  });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
    admin = await factories.adminUser();
    adminToken = await factories.tokenFor(admin);
    clientA = await factories.client();
    clientB = await factories.client();
    const product = await factories.product();
    productId = product.id;
    const today = toBogotaLocalDate(new Date());
    subscriptionA = (
      await factories.subscription(clientA, product, { status: 'activa', startDate: today })
    ).id;
    subscriptionB = (
      await factories.subscription(clientB, product, { status: 'activa', startDate: today })
    ).id;
    const task = await request(app)
      .post('/api/v1/renewal-tasks')
      .set(auth(adminToken))
      .send({
        taskType: 'contact_client',
        title: 'Contactar al cliente',
        clientId: clientA.id,
        subscriptionId: subscriptionA,
        priority: 'medium',
        dueDate: today,
      });
    expect(task.status).toBe(201);
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  it('T-RN12-02 — lee clientes, productos, suscripciones y crea una solicitud auditada', async () => {
    const { integration, apiKey } = await createIntegration();

    const clients = await request(app).get('/api/v1/clients').set(api(apiKey));
    expect(clients.status).toBe(200);
    expectMatchesOperation(clients, 'listClients');
    expect(clients.body.data.map((c: { id: string }) => c.id).sort()).toEqual(
      [clientA.id, clientB.id].sort(),
    );

    const products = await request(app).get('/api/v1/products').set(api(apiKey));
    expect(products.status).toBe(200);
    expectMatchesOperation(products, 'listProducts');
    expect(products.body.data.some((p: { id: string }) => p.id === productId)).toBe(true);

    const subscriptions = await request(app).get('/api/v1/subscriptions').set(api(apiKey));
    expect(subscriptions.status).toBe(200);
    expectMatchesOperation(subscriptions, 'listSubscriptions');
    expect(subscriptions.body.data).toHaveLength(2);
    expect(subscriptions.body.data[0].supplierCostAmount).toBeUndefined();
    expect(subscriptions.body.data[0].notes).toBeUndefined();

    const detail = await request(app)
      .get(`/api/v1/subscriptions/${subscriptionA}`)
      .set(api(apiKey));
    expect(detail.status).toBe(200);
    expectMatchesOperation(detail, 'getSubscription');
    expect(detail.body.supplierCostAmount).toBeUndefined();
    expect(detail.body.notes).toBeUndefined();

    const periods = await request(app)
      .get(`/api/v1/subscriptions/${subscriptionA}/periods`)
      .set(api(apiKey));
    expect(periods.status).toBe(200);
    expectMatchesOperation(periods, 'listSubscriptionPeriods');
    expect(periods.body.data).toHaveLength(1);

    const expiring = await request(app)
      .get('/api/v1/subscriptions/expiring?withinDays=365')
      .set(api(apiKey));
    expect(expiring.status).toBe(200);
    expectMatchesOperation(expiring, 'listExpiringSubscriptions');

    const tasks = await request(app).get('/api/v1/renewal-tasks').set(api(apiKey));
    expect(tasks.status).toBe(200);
    expectMatchesOperation(tasks, 'listRenewalTasks');

    const created = await request(app)
      .post('/api/v1/renewal-requests')
      .set(api(apiKey))
      .set('Idempotency-Key', 'integration-request-0001')
      .send({ subscriptionId: subscriptionA, comment: 'Renovar desde el ERP' });
    expect(created.status).toBe(201);
    expectMatchesOperation(created, 'createRenewalRequest');
    const requestDto = created.body as RenewalRequestDto;
    expect(requestDto).toMatchObject({
      subscriptionId: subscriptionA,
      status: 'pendiente_revision',
      requestedBy: { actorType: 'integration', id: integration.id },
    });

    const internal = await request(app)
      .get('/api/v1/renewal-requests')
      .set(auth(adminToken));
    expect(internal.status).toBe(200);
    expect(internal.body.data.some((r: { id: string }) => r.id === requestDto.id)).toBe(true);

    const humanExpiring = await request(app)
      .get('/api/v1/subscriptions/expiring?withinDays=365')
      .set(auth(adminToken));
    expect(humanExpiring.status).toBe(200);
    expectMatchesOperation(humanExpiring, 'listExpiringSubscriptions');

    const byId = await request(app)
      .get(`/api/v1/renewal-requests/${requestDto.id}`)
      .set(api(apiKey));
    expect(byId.status).toBe(200);
    expectMatchesOperation(byId, 'getRenewalRequest');
    expect(byId.body.id).toBe(requestDto.id);
  });

  it('T-RN12-01 — own no ve clientes ni suscripciones fuera de alcance', async () => {
    const { apiKey } = await createIntegration({
      client_scope: 'own',
      client_ids: [clientA.id],
    });
    const clients = await request(app).get('/api/v1/clients').set(api(apiKey));
    expect(clients.status).toBe(200);
    expect(clients.body.data.map((c: { id: string }) => c.id)).toEqual([clientA.id]);
    expect(
      (await request(app).get(`/api/v1/clients/${clientB.id}`).set(api(apiKey))).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/v1/subscriptions/${subscriptionB}`).set(api(apiKey))).status,
    ).toBe(404);
  });

  it('T-RN12-03 — sin scope ⇒ 403; key revocada o integración deshabilitada ⇒ 401', async () => {
    const { integration, apiKey } = await createIntegration({ scopes: ['clients:read'] });
    expect(
      (await request(app).get('/api/v1/subscriptions').set(api(apiKey))).status,
    ).toBe(403);

    const credentials = await request(app)
      .get(`/api/v1/integrations/${integration.id}/credentials`)
      .set(auth(adminToken));
    const credentialId = credentials.body.data[0].id as string;
    expect(
      (
        await request(app)
          .post(`/api/v1/integrations/${integration.id}/credentials/${credentialId}/revoke`)
          .set(auth(adminToken))
      ).status,
    ).toBe(200);
    expect((await request(app).get('/api/v1/clients').set(api(apiKey))).status).toBe(401);

    const { integration: second, apiKey: secondKey } = await createIntegration();
    await request(app)
      .patch(`/api/v1/integrations/${second.id}`)
      .set(auth(adminToken))
      .send({ status: 'deshabilitada' });
    expect((await request(app).get('/api/v1/clients').set(api(secondKey))).status).toBe(401);
  });

  it('T-API-04 — rate limit por integración devuelve 429 y Retry-After', async () => {
    const { apiKey } = await createIntegration({ rate_limit_per_minute: 1 });
    const first = await request(app).get('/api/v1/clients').set(api(apiKey));
    expect(first.status).toBe(200);
    expect(first.headers['ratelimit']).toMatch(/limit=1/);
    const second = await request(app).get('/api/v1/clients').set(api(apiKey));
    expect(second.status).toBe(429);
    expect(second.headers['retry-after']).toBeDefined();
    expect(second.body.code).toBe('rate_limited');
  });

  it('las rutas humanas no aceptan una API key', async () => {
    const { apiKey } = await createIntegration();
    expect((await request(app).get('/api/v1/users').set(api(apiKey))).status).toBe(401);
  });
});
