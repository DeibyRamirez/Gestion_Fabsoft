import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ReconcileAlerts } from '../../../src/application/alerts/reconcile-alerts/use-case.js';
import { buildPgInfra } from '../../../src/composition/pg-infra.js';
import type { Infra } from '../../../src/composition/infra.js';
import { loadEnv } from '../../../src/infrastructure/config/env.js';
import { addDays, type LocalDate } from '../../../src/domain/subscriptions/local-date.js';
import { toBogotaLocalDate } from '../../../src/domain/subscriptions/bogota-date.js';
import { createFactories, type Factories, type FactoryUser } from '../../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
  withAppContext,
} from '../../helpers/db.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../../helpers/app.js';
import { testEnvSource } from '../../helpers/env.js';

assertDbTestsRequired();

type NotificationRow = {
  code: string | null;
  channel: string;
  period_end: string;
  status: string;
  cancel_reason: string | null;
  recipient_user_id: string;
  dedupe_key: string;
};

type TaskRow = {
  id: string;
  code: string | null;
  status: string;
  outcome: string | null;
  notes: string | null;
  version: number;
  due_date: string;
  dedupe_key: string | null;
};

async function seedAlertRules(adminId: string): Promise<void> {
  await withAppContext(
    { role: 'admin', userId: adminId, clientId: null, requestId: 'seed-alert-rules' },
    async (c) => {
      await c.query(
        `insert into app.alert_rules
           (code, description, offset_days, channels, creates_task, task_type, task_priority,
            applies_when_not_renewable)
         values
           ('D30','Preparar renovación',30,'{in_app,email}',true,'send_proposal','medium',false),
           ('D15','Contactar cliente',15,'{in_app,email}',true,'contact_client','high',false),
           ('D7','Seguimiento',7,'{in_app,email}',false,null,null,false),
           ('D1','Vencimiento inminente',1,'{in_app,email}',false,null,null,false),
           ('D0','Día del vencimiento',0,'{in_app}',false,null,null,false),
           ('POST1','Revisión de vencida',-1,'{in_app,email}',true,'review_expired','urgent',false)
         on conflict (code) do nothing`,
      );
    },
  );
}

describe.skipIf(!dbTestsConfigured())('Motor de alertas (RN-08/RN-09/RN-10)', () => {
  let factories: Factories;
  let infra: Infra;
  let reconciler: ReconcileAlerts;
  let admin: FactoryUser;

  beforeAll(async () => {
    factories = createFactories({ tokens: await getTestAccessTokens() });
    infra = await buildPgInfra(loadEnv(testEnvSource()));
    reconciler = new ReconcileAlerts(infra.workerUow, infra.clock);
  });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
    admin = await factories.adminUser();
    await seedAlertRules(admin.id);
  });

  afterAll(async () => {
    await infra.close();
    await closeTestApp();
    await closeTestPools();
  });

  async function createActivated(
    options: {
      ownerUserId?: string | null;
      endInDays?: number;
    } = {},
  ) {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);
    const today = toBogotaLocalDate(new Date());

    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId: client.id,
        productId: product.id,
        startDate: today,
        currentPeriodEnd: addDays(today, options.endInDays ?? 30),
        billingCycle: 'monthly',
        priceAmount: '100000.00',
        ownerUserId: options.ownerUserId ?? null,
      });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const activated = await request(app)
      .post(`/api/v1/subscriptions/${id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1 });
    expect(activated.status).toBe(200);
    return {
      app,
      id,
      token,
      operator,
      client,
      product,
      today,
      periodEnd: created.body.currentPeriodEnd as LocalDate,
      version: activated.body.version as number,
    };
  }

  async function listNotifications(
    subscriptionId: string,
    adminId: string,
  ): Promise<NotificationRow[]> {
    return withAppContext(
      { role: 'admin', userId: adminId, clientId: null, requestId: 'alert-engine-test' },
      async (c) => {
        const { rows } = await c.query<NotificationRow>(
          `select r.code, n.channel, n.period_end::text, n.status, n.cancel_reason,
                  n.recipient_user_id, n.dedupe_key
             from app.notifications n
             left join app.alert_rules r on r.id = n.alert_rule_id
            where n.subscription_id = $1
            order by n.period_end, r.code, n.channel, n.recipient_user_id`,
          [subscriptionId],
        );
        return rows;
      },
    );
  }

  async function listTasks(subscriptionId: string, adminId: string): Promise<TaskRow[]> {
    return withAppContext(
      { role: 'admin', userId: adminId, clientId: null, requestId: 'alert-engine-test' },
      async (c) => {
        const { rows } = await c.query<TaskRow>(
          `select t.id, r.code, t.status, t.outcome, t.notes, t.version,
                  t.due_date::text, t.dedupe_key
             from app.tasks t
             left join app.alert_rules r on r.id = t.alert_rule_id
            where t.subscription_id = $1
            order by t.due_date, r.code`,
          [subscriptionId],
        );
        return rows;
      },
    );
  }

  it('T-RN08-01: reconciliar 3 veces no duplica notificaciones', async () => {
    const { id } = await createActivated({ ownerUserId: admin.id });

    const initial = await listNotifications(id, admin.id);
    expect(initial).toHaveLength(11);
    expect(initial.every((n) => n.status === 'pending')).toBe(true);
    expect(await listTasks(id, admin.id)).toHaveLength(3);

    for (let i = 0; i < 3; i++) {
      await reconciler.execute(`reconcile-${i}`);
    }
    const after = await listNotifications(id, admin.id);
    expect(after).toHaveLength(11);
    expect(new Set(after.map((n) => n.dedupe_key)).size).toBe(11);
    expect(after.every((n) => n.status === 'pending')).toBe(true);
    expect(await listTasks(id, admin.id)).toHaveLength(3);
  });

  it('T-RN09-01: corregir vencimiento cancela el periodo anterior y programa el nuevo', async () => {
    const { app, id, token, operator, periodEnd, version, today } = await createActivated({
      ownerUserId: admin.id,
    });

    const beforeTasks = await listTasks(id, admin.id);
    const d30 = beforeTasks.find((t) => t.code === 'D30')!;
    const moved = await request(app)
      .patch(`/api/v1/renewal-tasks/${d30.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1, status: 'in_progress' });
    expect(moved.status).toBe(200);

    const corrected = await request(app)
      .post(`/api/v1/subscriptions/${id}/correct-expiration`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        version,
        newCurrentPeriodEnd: addDays(today, 45),
        reason: 'Ajuste de contrato',
      });
    expect(corrected.status).toBe(200);
    void operator;

    const rows = await listNotifications(id, admin.id);
    const oldPending = rows.filter((n) => n.period_end === periodEnd && n.status === 'pending');
    const oldCancelled = rows.filter((n) => n.period_end === periodEnd && n.status === 'cancelled');
    const newPending = rows.filter((n) => n.period_end === addDays(today, 45));
    expect(oldPending).toHaveLength(0);
    expect(oldCancelled).toHaveLength(11);
    expect(oldCancelled.every((n) => n.cancel_reason === 'period_end_changed')).toBe(true);
    expect(newPending).toHaveLength(11);
    expect(newPending.every((n) => n.status === 'pending')).toBe(true);

    const tasks = await listTasks(id, admin.id);
    const oldTasks = tasks.filter((t) => t.dedupe_key?.endsWith(`:${periodEnd}`));
    const newTasks = tasks.filter((t) => t.dedupe_key?.endsWith(`:${addDays(today, 45)}`));
    expect(oldTasks.find((t) => t.code === 'D30')).toMatchObject({ status: 'in_progress' });
    expect(oldTasks.find((t) => t.code === 'D30')?.notes).toContain('Vencimiento corregido');
    expect(oldTasks.filter((t) => t.code !== 'D30')).toHaveLength(2);
    expect(oldTasks.filter((t) => t.code !== 'D30').every((t) => t.status === 'cancelled')).toBe(
      true,
    );
    expect(newTasks).toHaveLength(3);
    expect(newTasks.every((t) => t.status === 'pending')).toBe(true);
  });

  it('T-RN09-02: renovar cancela las alertas del periodo anterior y programa las nuevas', async () => {
    const { app, id, token, client, periodEnd, version } = await createActivated({
      ownerUserId: admin.id,
    });
    const requestId = await withAppContext(
      { role: 'admin', userId: admin.id, clientId: null, requestId: 'create-renewal-request' },
      async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `insert into app.renewal_requests
             (subscription_id, client_id, requested_by_user_id, status)
           values ($1, $2, $3, 'pending_review')
           returning id`,
          [id, client.id, admin.id],
        );
        return rows[0]!.id;
      },
    );

    const started = await request(app)
      .post(`/api/v1/subscriptions/${id}/start-renewal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version });
    expect(started.status).toBe(200);

    const renewed = await request(app)
      .post(`/api/v1/subscriptions/${id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: started.body.version, newPeriod: { priceAmount: '120000.00' } });
    expect(renewed.status).toBe(200);
    const newPeriodEnd = renewed.body.currentPeriodEnd as string;

    const rows = await listNotifications(id, admin.id);
    const oldCancelled = rows.filter((n) => n.period_end === periodEnd && n.status === 'cancelled');
    const newPending = rows.filter((n) => n.period_end === newPeriodEnd);
    expect(oldCancelled).toHaveLength(11);
    expect(oldCancelled.every((n) => n.cancel_reason === 'renewed')).toBe(true);
    expect(newPending).toHaveLength(11);
    expect(newPending.every((n) => n.status === 'pending')).toBe(true);

    const tasks = await listTasks(id, admin.id);
    const oldTasks = tasks.filter((t) => t.dedupe_key?.endsWith(`:${periodEnd}`));
    const newTasks = tasks.filter((t) => t.dedupe_key?.endsWith(`:${newPeriodEnd}`));
    expect(oldTasks).toHaveLength(3);
    expect(oldTasks.every((t) => t.status === 'completed')).toBe(true);
    expect(oldTasks.every((t) => t.outcome === 'Renovación confirmada')).toBe(true);
    expect(newTasks).toHaveLength(3);
    expect(newTasks.every((t) => t.status === 'pending')).toBe(true);

    const resolved = await withAppContext(
      { role: 'admin', userId: admin.id, clientId: null, requestId: 'read-renewal-request' },
      async (c) => {
        const { rows } = await c.query<{ status: string; resolution: string | null }>(
          `select status, resolution from app.renewal_requests where id = $1`,
          [requestId],
        );
        return rows[0];
      },
    );
    expect(resolved).toMatchObject({ status: 'resolved', resolution: 'renewed' });
  });

  it('T-RN09-03: cancelar deja todas las pendientes canceladas y reconcile no crea nuevas', async () => {
    const { app, id, token, operator, version } = await createActivated({
      ownerUserId: admin.id,
    });
    const adminToken = await factories.tokenFor(admin);
    void token;
    void operator;

    const cancelled = await request(app)
      .post(`/api/v1/subscriptions/${id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ version, reason: 'Fin de contrato' });
    expect(cancelled.status).toBe(200);

    let rows = await listNotifications(id, admin.id);
    expect(rows).toHaveLength(11);
    expect(rows.every((n) => n.status === 'cancelled')).toBe(true);
    expect(rows.every((n) => n.cancel_reason === 'subscription_cancelled')).toBe(true);

    await reconciler.execute('reconcile-after-cancel');
    rows = await listNotifications(id, admin.id);
    expect(rows.filter((n) => n.status === 'pending')).toHaveLength(0);
    const tasks = await listTasks(id, admin.id);
    expect(tasks).toHaveLength(3);
    expect(tasks.every((t) => t.status === 'cancelled')).toBe(true);
  });

  it('not-renewed cancela pendientes sin excepción y reconcile no las recrea', async () => {
    const { app, id, token, version } = await createActivated({ ownerUserId: admin.id });

    const marked = await request(app)
      .post(`/api/v1/subscriptions/${id}/not-renewed`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version, reason: 'El cliente no continuará' });
    expect(marked.status).toBe(200);

    let rows = await listNotifications(id, admin.id);
    expect(rows).toHaveLength(11);
    expect(rows.every((n) => n.status === 'cancelled')).toBe(true);
    expect(rows.every((n) => n.cancel_reason === 'not_renewed')).toBe(true);

    await reconciler.execute('reconcile-after-not-renewed');
    rows = await listNotifications(id, admin.id);
    expect(rows.filter((n) => n.status === 'pending')).toHaveLength(0);
    const tasks = await listTasks(id, admin.id);
    expect(tasks).toHaveLength(3);
    expect(tasks.every((t) => t.status === 'cancelled')).toBe(true);
  });

  it('reconcile cancela pendientes de una regla desactivada', async () => {
    const { id } = await createActivated({ ownerUserId: admin.id });

    await withAppContext(
      { role: 'admin', userId: admin.id, clientId: null, requestId: 'disable-d7' },
      async (c) => {
        await c.query(`update app.alert_rules set is_active = false where code = 'D7'`);
      },
    );
    const result = await reconciler.execute('reconcile-inactive-rule');
    expect(result.cancelled).toBe(2);

    const rows = await listNotifications(id, admin.id);
    const d7 = rows.filter((n) => n.code === 'D7');
    expect(d7).toHaveLength(2);
    expect(d7.every((n) => n.status === 'cancelled')).toBe(true);
    expect(d7.every((n) => n.cancel_reason === 'rule_changed')).toBe(true);
    expect(rows.filter((n) => n.status === 'pending')).toHaveLength(9);
  });

  it('T-RN10-02: no renovable sólo conserva la regla con excepción (D0)', async () => {
    await withAppContext(
      { role: 'admin', userId: admin.id, clientId: null, requestId: 'enable-d0-exception' },
      async (c) => {
        await c.query(
          `update app.alert_rules set applies_when_not_renewable = true where code = 'D0'`,
        );
      },
    );

    const { app, id, token, version } = await createActivated({ ownerUserId: admin.id });
    const patched = await request(app)
      .patch(`/api/v1/subscriptions/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version, isRenewable: false });
    expect(patched.status).toBe(200);

    let rows = await listNotifications(id, admin.id);
    expect(rows.filter((n) => n.status === 'pending')).toEqual([
      expect.objectContaining({ code: 'D0' }),
    ]);
    expect(rows.filter((n) => n.cancel_reason === 'not_renewable')).toHaveLength(10);

    await reconciler.execute('reconcile-not-renewable');
    rows = await listNotifications(id, admin.id);
    expect(rows.filter((n) => n.status === 'pending')).toHaveLength(1);
    expect(rows.find((n) => n.status === 'pending')?.code).toBe('D0');
  });

  it('destinatario: sin responsables cae en los admins activos', async () => {
    const { id } = await createActivated({ ownerUserId: null });

    const rows = await listNotifications(id, admin.id);
    expect(rows).toHaveLength(11);
    expect(rows.every((n) => n.recipient_user_id === admin.id)).toBe(true);
  });
});
