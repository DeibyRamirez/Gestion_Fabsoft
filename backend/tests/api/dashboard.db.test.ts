import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AlertRuleListSchema,
  DashboardActivitySchema,
  DashboardSummarySchema,
} from '@fabsoft/shared';
import { addDays, type LocalDate } from '../../src/domain/subscriptions/local-date.js';
import { toBogotaLocalDate } from '../../src/domain/subscriptions/bogota-date.js';
import { createFactories, type Factories, type FactoryUser } from '../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
  withAppContext,
} from '../helpers/db.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../helpers/app.js';
import { expectMatchesOperation } from '../helpers/openapi.js';

assertDbTestsRequired();

describe.skipIf(!dbTestsConfigured())('Dashboard API (Postgres)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let factories: Factories;
  let admin: FactoryUser;
  let operator: FactoryUser;
  let client: FactoryUser;
  let adminToken: string;
  let operatorToken: string;
  let clientToken: string;
  let today: LocalDate;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function seedScenario() {
    const clientRow = await factories.client();
    const product = await factories.product();
    const ids = {
      s1: randomUUID(),
      s2: randomUUID(),
      s3: randomUUID(),
      s4: randomUUID(),
      s5: randomUUID(),
      s6: randomUUID(),
      s7: randomUUID(),
      s8: randomUUID(),
    };

    await withAppContext(
      { role: 'admin', userId: admin.id, clientId: null, requestId: 'dashboard-fixture' },
      async (c) => {
        const insertSubscription = async (
          id: string,
          endOffset: number,
          status: string,
          followUp = 'none',
        ) => {
          await c.query(
            `insert into app.subscriptions
               (id, client_id, product_id, start_date, current_period_end, billing_cycle,
                price_amount, status, follow_up_status, owner_user_id)
             values ($1, $2, $3, $4, $5, 'monthly', '100000.00',
                     'active', $6::app.follow_up_status, $7)`,
            [
              id,
              clientRow.id,
              product.id,
              addDays(today, -1),
              addDays(today, endOffset),
              followUp,
              admin.id,
            ],
          );
          if (status !== 'active') {
            await c.query(
              `update app.subscriptions set status = $2::app.subscription_status where id = $1`,
              [id, status],
            );
          }
        };
      await insertSubscription(ids.s1, 30, 'active');
      await insertSubscription(ids.s2, 15, 'in_renewal');
      await insertSubscription(ids.s3, 7, 'active');
      await insertSubscription(ids.s4, 0, 'active');
      await insertSubscription(ids.s5, 31, 'active');
      await insertSubscription(ids.s6, -1, 'expired');
      await insertSubscription(ids.s7, 15, 'active', 'awaiting_client');
      await insertSubscription(ids.s8, 75, 'active');

      const insertTask = async (id: string, dueOffset: number, status: string) =>
        c.query(
          `insert into app.tasks
             (id, task_type, client_id, subscription_id, assignee_user_id, priority,
              due_date, status, title, completed_at)
           values ($1, 'other', $2, $3, $4, 'medium', $5, $6::app.task_status, 'Tarea',
                   case when $6::app.task_status in ('completed','cancelled') then now() end)`,
          [id, clientRow.id, ids.s1, admin.id, addDays(today, dueOffset), status],
        );
      await insertTask(randomUUID(), -1, 'pending');
      await insertTask(randomUUID(), 0, 'pending');
      await insertTask(randomUUID(), 5, 'in_progress');
      await insertTask(randomUUID(), -2, 'completed');
      await insertTask(randomUUID(), 1, 'cancelled');

      const pendingRequestId = randomUUID();
      const inProgressRequestId = randomUUID();
      await c.query(
        `insert into app.renewal_requests
           (id, subscription_id, client_id, requested_by_user_id, status, assigned_user_id)
         values
           ($1, $2, $3, $4, 'pending_review', $4),
           ($5, $2, $3, $4, 'pending_review', $4)`,
        [pendingRequestId, ids.s1, clientRow.id, admin.id, inProgressRequestId],
      );
      await c.query(
        `update app.renewal_requests set status = 'in_progress' where id = $1`,
        [inProgressRequestId],
      );

      await c.query(
        `insert into app.alert_rules
           (code, description, offset_days, channels, creates_task, applies_when_not_renewable)
         values ('D30', 'Preparar renovación', 30, '{in_app}', false, false)
         on conflict (code) do nothing`,
      );
    });

    return { clientRow, product, ids };
  }

  beforeAll(async () => {
    app = await buildTestApp();
    factories = createFactories({ tokens: await getTestAccessTokens() });
  });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
    today = toBogotaLocalDate(new Date());
    admin = await factories.adminUser();
    operator = await factories.operatorUser();
    const clientRow = await factories.client();
    client = await factories.user({ role: 'client', clientId: clientRow.id });
    adminToken = await factories.tokenFor(admin);
    operatorToken = await factories.tokenFor(operator);
    clientToken = await factories.tokenFor(client);
    await seedScenario();
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  it('devuelve los 10 indicadores y filtros navegables para admin/operator', async () => {
    const res = await request(app).get('/api/v1/dashboard/summary').set(auth(adminToken));
    expect(res.status).toBe(200);
    expectMatchesOperation(res, 'getDashboardSummary');
    const summary = DashboardSummarySchema.parse(res.body);

    expect(summary.today).toBe(today);
    expect(summary.activeSubscriptions.count).toBe(7);
    expect(summary.expiringIn30Days.count).toBe(5);
    expect(summary.expiringIn15Days.count).toBe(4);
    expect(summary.expiringIn7Days.count).toBe(2);
    expect(summary.expiredSubscriptions.count).toBe(1);
    expect(summary.renewalsPendingResponse.count).toBe(1);
    expect(summary.overdueTasks.count).toBe(1);
    expect(summary.upcomingTasks.count).toBe(2);
    expect(summary.newRenewalRequests.count).toBe(1);

    expect(summary.activeSubscriptions.filter).toEqual({ status: 'active,in_renewal' });
    expect(summary.expiringIn30Days.filter).toEqual({
      status: 'active,in_renewal',
      expiresFrom: today,
      expiresTo: addDays(today, 30),
    });
    expect(summary.overdueTasks.filter).toMatchObject({
      status: 'pending,in_progress',
      overdue: 'true',
    });
    expect(summary.newRenewalRequests.filter).toEqual({ status: 'pending_review' });

    const operatorRes = await request(app)
      .get('/api/v1/dashboard/summary')
      .set(auth(operatorToken));
    expect(operatorRes.status).toBe(200);
  });

  it('expone expiresFrom/expiresTo en el listado de suscripciones', async () => {
    const res = await request(app)
      .get(
        `/api/v1/subscriptions?status=active,in_renewal&expiresFrom=${today}&expiresTo=${addDays(today, 30)}`,
      )
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(5);

    const invalid = await request(app)
      .get(`/api/v1/subscriptions?expiresFrom=${addDays(today, 30)}&expiresTo=${today}`)
      .set(auth(adminToken));
    expect(invalid.status).toBe(400);
  });

  it('ownerUserId=me resuelve al usuario y filtra sus recursos', async () => {
    const mine = DashboardSummarySchema.parse(
      (await request(app).get('/api/v1/dashboard/summary?ownerUserId=me').set(auth(adminToken)))
        .body,
    );
    expect(mine.activeSubscriptions.count).toBe(7);
    expect(mine.activeSubscriptions.filter.ownerUserId).toBe(admin.id);
    expect(mine.overdueTasks.filter.assigneeUserId).toBe(admin.id);

    const none = DashboardSummarySchema.parse(
      (await request(app)
        .get(`/api/v1/dashboard/summary?ownerUserId=${operator.id}`)
        .set(auth(adminToken))).body,
    );
    expect(none.activeSubscriptions.count).toBe(0);
    expect(none.overdueTasks.count).toBe(0);
  });

  it('activity respeta el alcance de admin/operator y el cliente recibe 403', async () => {
    const createdClient = await request(app)
      .post('/api/v1/clients')
      .set(auth(adminToken))
      .send({ legalName: 'Cliente actividad', taxId: null });
    expect(createdClient.status).toBe(201);

    const rule = AlertRuleListSchema.parse(
      (await request(app).get('/api/v1/alert-rules').set(auth(adminToken))).body,
    ).data[0]!;
    expect(
      (
        await request(app)
          .patch(`/api/v1/alert-rules/${rule.id}`)
          .set(auth(adminToken))
          .send({ description: 'Preparar renovación actualizada' })
      ).status,
    ).toBe(200);

    const adminActivityRes = await request(app)
      .get('/api/v1/dashboard/activity?limit=20')
      .set(auth(adminToken));
    expect(adminActivityRes.status).toBe(200);
    expectMatchesOperation(adminActivityRes, 'getDashboardActivity');
    const adminActivity = DashboardActivitySchema.parse(adminActivityRes.body);
    expect(adminActivity.data).toHaveLength(2);

    const operatorActivityRes = await request(app)
      .get('/api/v1/dashboard/activity?limit=20')
      .set(auth(operatorToken));
    expectMatchesOperation(operatorActivityRes, 'getDashboardActivity');
    const operatorActivity = DashboardActivitySchema.parse(operatorActivityRes.body);
    expect(operatorActivity.data).toHaveLength(1);
    expect(operatorActivity.data[0]?.resourceType).toBe('client');

    expect((await request(app).get('/api/v1/dashboard/summary').set(auth(clientToken))).status).toBe(
      403,
    );
    expect(
      (await request(app).get('/api/v1/dashboard/activity').set(auth(clientToken))).status,
    ).toBe(403);
  });
});
