import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RenewalRequestPageSchema } from '@fabsoft/shared';
import { toBogotaLocalDate } from '../../src/domain/subscriptions/bogota-date.js';
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

describe.skipIf(!dbTestsConfigured())('Renewal requests list API (Postgres)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let factories: Factories;
  let admin: FactoryUser;
  let operator: FactoryUser;
  let client: FactoryUser;
  let adminToken: string;
  let operatorToken: string;
  let clientToken: string;
  let clientId: string;
  let pendingRequestId: string;

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
    clientId = clientRow.id;
    adminToken = await factories.tokenFor(admin);
    operatorToken = await factories.tokenFor(operator);
    clientToken = await factories.tokenFor(client);

    const product = await factories.product();
    const subscription = await factories.subscription(clientRow, product, {
      status: 'activa',
      startDate: toBogotaLocalDate(new Date()),
    });
    const pending = await factories.renewalRequest(subscription, {
      status: 'pendiente_revision',
      requestedByUserId: admin.id,
    });
    pendingRequestId = pending.id;
    await factories.renewalRequest(subscription, {
      status: 'en_progreso',
      requestedByUserId: admin.id,
    });
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  it('lista y filtra solicitudes para admin/operator', async () => {
    const res = await request(app)
      .get(`/api/v1/renewal-requests?status=pendiente_revision&clientId=${clientId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expectMatchesOperation(res, 'listRenewalRequests');
    const page = RenewalRequestPageSchema.parse(res.body);
    expect(page.meta.total).toBe(1);
    expect(page.data[0]!.id).toBe(pendingRequestId);
    expect(page.data[0]!.requestedBy.actorType).toBe('user');

    expect(
      (await request(app).get('/api/v1/renewal-requests').set(auth(operatorToken))).status,
    ).toBe(200);
  });

  it('obtiene el detalle de una solicitud y responde 404 si no existe', async () => {
    const res = await request(app)
      .get(`/api/v1/renewal-requests/${pendingRequestId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expectMatchesOperation(res, 'getRenewalRequest');
    expect(res.body.id).toBe(pendingRequestId);

    const operatorRes = await request(app)
      .get(`/api/v1/renewal-requests/${pendingRequestId}`)
      .set(auth(operatorToken));
    expect(operatorRes.status).toBe(200);

    const missing = await request(app)
      .get('/api/v1/renewal-requests/00000000-0000-4000-8000-000000000000')
      .set(auth(adminToken));
    expect(missing.status).toBe(404);
  });

  it('cliente no puede listar solicitudes internas', async () => {
    expect((await request(app).get('/api/v1/renewal-requests').set(auth(clientToken))).status).toBe(
      403,
    );
  });

  it('asigna responsable y pasa la solicitud a en progreso', async () => {
    const res = await request(app)
      .patch(`/api/v1/renewal-requests/${pendingRequestId}`)
      .set(auth(adminToken))
      .send({ assignedUserId: operator.id, status: 'en_progreso' });

    expect(res.status).toBe(200);
    expectMatchesOperation(res, 'updateRenewalRequest');
    expect(res.body.status).toBe('en_progreso');
    expect(res.body.assignedUser).toMatchObject({ id: operator.id });
  });

  it('resuelve una solicitud como no renovada', async () => {
    const res = await request(app)
      .post(`/api/v1/renewal-requests/${pendingRequestId}/resolve`)
      .set(auth(operatorToken))
      .send({ resolution: 'no_renovada', resolutionNote: 'El cliente no continúa' });

    expect(res.status).toBe(200);
    expectMatchesOperation(res, 'resolveRenewalRequest');
    expect(res.body.status).toBe('resuelta');
    expect(res.body.resolution).toBe('no_renovada');
    expect(res.body.resolutionNote).toBe('El cliente no continúa');
  });

  it('no permite resolver renovada sin una renovación confirmada', async () => {
    const res = await request(app)
      .post(`/api/v1/renewal-requests/${pendingRequestId}/resolve`)
      .set(auth(adminToken))
      .send({ resolution: 'renovada' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('renewal_not_confirmed');
  });

  it('cliente no puede modificar ni resolver solicitudes internas', async () => {
    expect(
      (
        await request(app)
          .patch(`/api/v1/renewal-requests/${pendingRequestId}`)
          .set(auth(clientToken))
          .send({ status: 'en_progreso' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/renewal-requests/${pendingRequestId}/resolve`)
          .set(auth(clientToken))
          .send({ resolution: 'otra' })
      ).status,
    ).toBe(403);
  });
});
