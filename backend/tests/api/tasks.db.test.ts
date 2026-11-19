import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, type LocalDate } from '../../src/domain/subscriptions/local-date.js';
import { toBogotaLocalDate } from '../../src/domain/subscriptions/bogota-date.js';
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

describe.skipIf(!dbTestsConfigured())('Tasks API (Postgres)', () => {
  let factories: Factories;
  let today: LocalDate;

  beforeAll(async () => {
    factories = createFactories({ tokens: await getTestAccessTokens() });
    today = toBogotaLocalDate(new Date());
  });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  const bodyFor = (
    clientId: string,
    over: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    taskType: 'contact_client',
    title: 'Llamar al cliente',
    clientId,
    dueDate: addDays(today, 2),
    priority: 'medium',
    ...over,
  });

  it('T-HU10 — crea, lista, filtra y consulta una tarea manual', async () => {
    const app = await buildTestApp();
    const operator = await factories.operatorUser();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(operator);
    const client = await factories.client();
    const product = await factories.product();
    const subscription = await factories.subscription(client, product, {
      status: 'active',
      startDate: today,
    });

    const created = await request(app)
      .post('/api/v1/renewal-tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send(
        bodyFor(client.id, {
          subscriptionId: subscription.id,
          assigneeUserId: admin.id,
          priority: 'high',
          nextAction: 'Confirmar renovación',
        }),
      );
    expect(created.status).toBe(201);
    expectMatchesOperation(created, 'createRenewalTask');
    expect(created.body.origin).toBe('manual');
    expect(created.body.status).toBe('pending');
    expect(created.body.isOverdue).toBe(false);
    expect(created.body.assignee.id).toBe(admin.id);

    const byAssignee = await request(app)
      .get(`/api/v1/renewal-tasks?assigneeUserId=${admin.id}&status=pending`)
      .set('Authorization', `Bearer ${token}`);
    expect(byAssignee.status).toBe(200);
    expectMatchesOperation(byAssignee, 'listRenewalTasks');
    expect(byAssignee.body.data).toHaveLength(1);

    const mine = await request(app)
      .get('/api/v1/renewal-tasks?assigneeUserId=me')
      .set('Authorization', `Bearer ${await factories.tokenFor(admin)}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);

    const byClient = await request(app)
      .get(`/api/v1/renewal-tasks?clientId=${client.id}&taskType=contact_client`)
      .set('Authorization', `Bearer ${token}`);
    expect(byClient.status).toBe(200);
    expect(byClient.body.data).toHaveLength(1);

    const detail = await request(app)
      .get(`/api/v1/renewal-tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expectMatchesOperation(detail, 'getRenewalTask');
    expect(detail.body.id).toBe(created.body.id);

    const overdueTask = await request(app)
      .post('/api/v1/renewal-tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send(bodyFor(client.id, { dueDate: addDays(today, -1) }));
    expect(overdueTask.status).toBe(201);
    expect(overdueTask.body.isOverdue).toBe(true);

    const overdue = await request(app)
      .get('/api/v1/renewal-tasks?overdue=true')
      .set('Authorization', `Bearer ${token}`);
    expect(overdue.status).toBe(200);
    expect(overdue.body.data).toHaveLength(1);
    expect(overdue.body.data[0].id).toBe(overdueTask.body.id);
  });

  it('T-HU10 — Idempotency-Key crea una sola tarea', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const client = await factories.client();
    const key = randomUUID();

    const first = await request(app)
      .post('/api/v1/renewal-tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(bodyFor(client.id));
    const second = await request(app)
      .post('/api/v1/renewal-tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(bodyFor(client.id));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const list = await request(app)
      .get(`/api/v1/renewal-tasks?clientId=${client.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.data).toHaveLength(1);
  });

  it('T-HU10 — update con versión, complete y cancel', async () => {
    const app = await buildTestApp();
    const admin = await factories.adminUser();
    const token = await factories.tokenFor(admin);
    const client = await factories.client();

    const created = await request(app)
      .post('/api/v1/renewal-tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send(bodyFor(client.id));
    const id = created.body.id as string;

    const updated = await request(app)
      .patch(`/api/v1/renewal-tasks/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, title: 'Llamar mañana', status: 'in_progress' });
    expect(updated.status).toBe(200);
    expectMatchesOperation(updated, 'updateRenewalTask');
    expect(updated.body.title).toBe('Llamar mañana');
    expect(updated.body.version).toBe(2);

    const stale = await request(app)
      .patch(`/api/v1/renewal-tasks/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, title: 'Vieja' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('version_conflict');

    const completed = await request(app)
      .post(`/api/v1/renewal-tasks/${id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 2, outcome: 'Cliente confirmó renovación' });
    expect(completed.status).toBe(200);
    expectMatchesOperation(completed, 'completeRenewalTask');
    expect(completed.body.status).toBe('completed');
    expect(completed.body.completedAt).not.toBeNull();

    const editClosed = await request(app)
      .patch(`/api/v1/renewal-tasks/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 3, title: 'No se puede' });
    expect(editClosed.status).toBe(422);
    expect(editClosed.body.code).toBe('invalid_state_transition');

    const second = await request(app)
      .post('/api/v1/renewal-tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send(bodyFor(client.id, { title: 'Tarea a cancelar' }));
    const cancelled = await request(app)
      .post(`/api/v1/renewal-tasks/${second.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, outcome: 'Ya no aplica' });
    expect(cancelled.status).toBe(200);
    expectMatchesOperation(cancelled, 'cancelRenewalTask');
    expect(cancelled.body.status).toBe('cancelled');
  });

  it('T-HU10 — RBAC y validación de cliente/suscripción/responsable', async () => {
    const app = await buildTestApp();
    const client = await factories.client();
    const otherClient = await factories.client();
    const product = await factories.product();
    const otherSubscription = await factories.subscription(otherClient, product, {
      status: 'active',
      startDate: today,
    });
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);
    const clientUser = await factories.clientUser(client);
    const clientToken = await factories.tokenFor(clientUser);

    const forbidden = await request(app)
      .get('/api/v1/renewal-tasks')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(forbidden.status).toBe(403);

    const badClient = await request(app)
      .post('/api/v1/renewal-tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send(bodyFor(randomUUID()));
    expect(badClient.status).toBe(400);
    expect(badClient.body.code).toBe('validation_error');

    const foreignSubscription = await request(app)
      .post('/api/v1/renewal-tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send(bodyFor(client.id, { subscriptionId: otherSubscription.id }));
    expect(foreignSubscription.status).toBe(400);
    expect(foreignSubscription.body.code).toBe('validation_error');

    const clientAssignee = await request(app)
      .post('/api/v1/renewal-tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send(bodyFor(client.id, { assigneeUserId: clientUser.id }));
    expect(clientAssignee.status).toBe(400);
    expect(clientAssignee.body.code).toBe('validation_error');
  });
});
