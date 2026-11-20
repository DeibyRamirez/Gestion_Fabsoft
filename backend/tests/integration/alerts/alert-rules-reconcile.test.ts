import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlertRuleListSchema } from '@fabsoft/shared';
import { ReconcileAlerts } from '../../../src/application/alerts/reconcile-alerts/use-case.js';
import { buildPgInfra } from '../../../src/composition/pg-infra.js';
import type { Infra } from '../../../src/composition/infra.js';
import { addDays, type LocalDate } from '../../../src/domain/subscriptions/local-date.js';
import { toBogotaLocalDate } from '../../../src/domain/subscriptions/bogota-date.js';
import { loadEnv } from '../../../src/infrastructure/config/env.js';
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

type AlertRow = {
  id: string;
  code: string;
  status: string;
  scheduled_for: Date;
  dedupe_key: string;
  cancel_reason: string | null;
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

async function notificationsFor(subscriptionId: string, adminId: string): Promise<AlertRow[]> {
  return withAppContext(
    { role: 'admin', userId: adminId, clientId: null, requestId: 'hu13-test' },
    async (c) => {
      const { rows } = await c.query<AlertRow>(
        `select n.id::text as id, r.code, n.status::text as status, n.scheduled_for,
                n.dedupe_key, n.cancel_reason
           from app.notifications n
           join app.alert_rules r on r.id = n.alert_rule_id
          where n.subscription_id = $1 and n.status = 'pending'
          order by r.code, n.channel`,
        [subscriptionId],
      );
      return rows;
    },
  );
}

describe.skipIf(!dbTestsConfigured())('HU-13 — umbrales y reconciliación', () => {
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

  it('aplica 45/10 en la siguiente reconciliación y conserva la clave idempotente', async () => {
    const app = await buildTestApp();
    const token = await factories.tokenFor(admin);
    const auth = { Authorization: `Bearer ${token}` };
    const today = toBogotaLocalDate(new Date());
    const client = await factories.client();
    const product = await factories.product();

    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set(auth)
      .send({
        clientId: client.id,
        productId: product.id,
        startDate: today,
        currentPeriodEnd: addDays(today, 30),
        billingCycle: 'monthly',
        priceAmount: '100000.00',
      });
    expect(created.status).toBe(201);
    const subscriptionId = created.body.id as string;
    const periodEnd = created.body.currentPeriodEnd as LocalDate;

    expect(
      (
        await request(app)
          .post(`/api/v1/subscriptions/${subscriptionId}/activate`)
          .set(auth)
          .send({ version: 1 })
      ).status,
    ).toBe(200);

    const before = await notificationsFor(subscriptionId, admin.id);
    const d30Before = before.find((n) => n.code === 'D30')!;
    const d15Before = before.find((n) => n.code === 'D15')!;
    expect(d30Before.scheduled_for.toISOString()).toBe(`${addDays(periodEnd, -30)}T13:00:00.000Z`);
    expect(d15Before.scheduled_for.toISOString()).toBe(`${addDays(periodEnd, -15)}T13:00:00.000Z`);

    const rules = AlertRuleListSchema.parse(
      (await request(app).get('/api/v1/alert-rules').set(auth)).body,
    );
    const d30 = rules.data.find((r) => r.code === 'D30')!;
    const d15 = rules.data.find((r) => r.code === 'D15')!;

    expect(
      (
        await request(app)
          .patch(`/api/v1/alert-rules/${d30.id}`)
          .set(auth)
          .send({ offsetDays: 45 })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .patch(`/api/v1/alert-rules/${d15.id}`)
          .set(auth)
          .send({ offsetDays: 10 })
      ).status,
    ).toBe(200);

    const result = await reconciler.execute('hu13-reconcile');
    expect(result.scannedSubscriptions).toBeGreaterThanOrEqual(1);

    const after = await notificationsFor(subscriptionId, admin.id);
    const d30After = after.find((n) => n.code === 'D30');
    const d15After = after.find((n) => n.code === 'D15');

    // D30 pasa a 45: la fecha ya pasó, la pendiente se cancela y no se duplica.
    expect(d30After).toBeUndefined();
    const cancelledD30 = await withAppContext(
      { role: 'admin', userId: admin.id, clientId: null, requestId: 'hu13-test' },
      async (c) => {
        const { rows } = await c.query<{ status: string; cancel_reason: string | null }>(
          `select n.status::text as status, n.cancel_reason
             from app.notifications n join app.alert_rules r on r.id = n.alert_rule_id
            where n.subscription_id = $1 and r.code = 'D30'`,
          [subscriptionId],
        );
        return rows;
      },
    );
    expect(cancelledD30.some((n) => n.status === 'cancelled' && n.cancel_reason === 'rule_changed')).toBe(
      true,
    );

    // D15 pasa a 10: se reprograma la misma fila, sin cambiar la dedupe key ni duplicar.
    expect(d15After).toBeDefined();
    expect(d15After!.id).toBe(d15Before.id);
    expect(d15After!.dedupe_key).toBe(d15Before.dedupe_key);
    expect(d15After!.scheduled_for.toISOString()).toBe(`${addDays(periodEnd, -10)}T13:00:00.000Z`);
    const beforeD15 = before.filter((n) => n.code === 'D15');
    const afterD15 = after.filter((n) => n.code === 'D15');
    expect(afterD15).toHaveLength(beforeD15.length);
    expect(new Set(afterD15.map((n) => n.dedupe_key)).size).toBe(afterD15.length);
  });
});
