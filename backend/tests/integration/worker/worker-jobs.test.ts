import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DispatchNotifications } from '../../../src/application/notifications/dispatch-notifications/use-case.js';
import { CleanupMaintenance } from '../../../src/application/maintenance/cleanup/use-case.js';
import {
  PermanentEmailError,
  RetryableEmailError,
  type EmailMessage,
} from '../../../src/application/notifications/shared/email-sender.js';
import { ExpireSubscriptions } from '../../../src/application/subscriptions/expire-subscriptions/use-case.js';
import { buildPgInfra } from '../../../src/composition/pg-infra.js';
import type { Infra } from '../../../src/composition/infra.js';
import { loadEnv } from '../../../src/infrastructure/config/env.js';
import { addDays, type LocalDate } from '../../../src/domain/subscriptions/local-date.js';
import { toBogotaLocalDate } from '../../../src/domain/subscriptions/bogota-date.js';
import {
  createFactories,
  type Factories,
  type FactoryClient,
  type FactoryProduct,
} from '../../fixtures/factories.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
  withAppContext,
} from '../../helpers/db.js';
import { closeTestApp, getTestAccessTokens } from '../../helpers/app.js';
import { testEnvSource } from '../../helpers/env.js';

assertDbTestsRequired();

describe.skipIf(!dbTestsConfigured())('Worker jobs (Postgres)', () => {
  let factories: Factories;
  let infra: Infra;
  let today: LocalDate;
  let adminId: string;
  let d30RuleId: string;
  let client: FactoryClient;
  let product: FactoryProduct;

  beforeAll(async () => {
    factories = createFactories({ tokens: await getTestAccessTokens() });
    infra = await buildPgInfra(loadEnv(testEnvSource()));
    today = toBogotaLocalDate(new Date());
  });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
    const admin = await factories.adminUser();
    adminId = admin.id;
    client = await factories.client();
    product = await factories.product();
    d30RuleId = await withAppContext(
      { role: 'admin', userId: adminId, clientId: null, requestId: 'seed-rule' },
      async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `insert into app.alert_rules
             (code, description, offset_days, channels, creates_task, applies_when_not_renewable)
           values ('D30','Preparar renovación',30,'{in_app,email}',false,false)
           returning id`,
        );
        return rows[0]!.id;
      },
    );
  });

  afterAll(async () => {
    await infra.close();
    await closeTestApp();
    await closeTestPools();
  });

  async function createSubscription(startDate: LocalDate = today) {
    return factories.subscription(client, product, { status: 'activa', startDate });
  }

  async function insertNotification(
    sub: { id: string; currentPeriodEnd: string },
    channel: 'in_app' | 'email',
    over: { periodEnd?: LocalDate; scheduledFor?: Date } = {},
  ) {
    const periodEnd = over.periodEnd ?? (sub.currentPeriodEnd as LocalDate);
    return withAppContext(
      { role: 'admin', userId: adminId, clientId: null, requestId: 'insert-notification' },
      async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `insert into app.notifications
             (notification_type, subscription_id, alert_rule_id, period_end, channel,
              recipient_user_id, scheduled_for, status, dedupe_key)
           values ('expiration_alert',$1,$2,$3,$4,$5,$6,'pendiente',$7)
           returning id`,
          [
            sub.id,
            d30RuleId,
            periodEnd,
            channel,
            adminId,
            over.scheduledFor ?? new Date(Date.now() - 60_000),
            `exp:${sub.id}:D30:${periodEnd}:${channel}:${adminId}`,
          ],
        );
        return rows[0]!.id;
      },
    );
  }

  async function readNotification(id: string) {
    return withAppContext(
      { role: 'admin', userId: adminId, clientId: null, requestId: 'read-notification' },
      async (c) => {
        const { rows } = await c.query<{
          status: string;
          attempts: number;
          provider_message_id: string | null;
          next_attempt_at: Date | null;
          last_error: string | null;
        }>(
          `select status, attempts, provider_message_id, next_attempt_at, last_error
             from app.notifications where id = $1`,
          [id],
        );
        return rows[0]!;
      },
    );
  }

  it('T-NOT-05: expira o marca no renovada según el periodo', async () => {
    const expired = await createSubscription(addDays(today, -40));
    const notRenewed = await createSubscription(addDays(today, -40));
    const future = await createSubscription();
    const past = addDays(today, -1);
    await withAppContext(
      { role: 'admin', userId: adminId, clientId: null, requestId: 'prepare-expire' },
      async (c) => {
        await c.query(
          `update app.subscriptions set current_period_end = $2 where id = any($1::uuid[])`,
          [[expired.id, notRenewed.id], past],
        );
        await c.query(
          `update app.subscription_periods set end_date = $2 where subscription_id = any($1::uuid[])`,
          [[expired.id, notRenewed.id], past],
        );
        await c.query(
          `update app.subscription_periods
              set renewal_outcome = 'no_renovada', outcome_reason = 'Fin', confirmed_at = now(),
                  confirmed_by = $2
            where subscription_id = $1`,
          [notRenewed.id, adminId],
        );
      },
    );
    const uc = new ExpireSubscriptions(infra.workerUow, infra.clock);
    await expect(uc.execute('job-expire')).resolves.toEqual({ expired: 1, notRenewed: 1 });

    const statuses = await withAppContext(
      { role: 'admin', userId: adminId, clientId: null, requestId: 'read-expire' },
      async (c) => {
        const { rows } = await c.query<{ id: string; status: string }>(
          `select id, status from app.subscriptions where id = any($1::uuid[])`,
          [[expired.id, notRenewed.id, future.id]],
        );
        return new Map(rows.map((r) => [r.id, r.status]));
      },
    );
    expect(statuses.get(expired.id)).toBe('vencida');
    expect(statuses.get(notRenewed.id)).toBe('no_renovada');
    expect(statuses.get(future.id)).toBe('activa');
  });

  it('T-NOT-04: dispatch envía in_app/email y registra intentos', async () => {
    const sub = await createSubscription();
    const inApp = await insertNotification(sub, 'in_app');
    const email = await insertNotification(sub, 'email');
    const messages: EmailMessage[] = [];
    const sender = {
      send: async (message: EmailMessage) => {
        messages.push(message);
        return { providerMessageId: 're_1' };
      },
    };
    const dispatch = new DispatchNotifications(
      infra.workerUow,
      sender,
      infra.clock,
      50,
      'http://localhost:3000',
    );
    await expect(dispatch.execute('job-dispatch')).resolves.toMatchObject({ sent: 2 });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.to).toContain('@');
    const a = await readNotification(inApp);
    const e = await readNotification(email);
    expect(a).toMatchObject({ status: 'enviada', attempts: 0 });
    expect(e).toMatchObject({ status: 'enviada', attempts: 1, provider_message_id: 're_1' });
  });

  it('dispatch programa backoff y luego falla el email', async () => {
    const sub = await createSubscription();
    const id = await insertNotification(sub, 'email');
    const retryable = new DispatchNotifications(
      infra.workerUow,
      {
        send: async () => {
          throw new RetryableEmailError('timeout');
        },
      },
      infra.clock,
      50,
      'http://localhost:3000',
    );
    await expect(retryable.execute('job-retry')).resolves.toMatchObject({ retried: 1 });
    const pending = await readNotification(id);
    expect(pending.status).toBe('pendiente');
    expect(pending.attempts).toBe(1);
    expect(pending.next_attempt_at).not.toBeNull();

    await withAppContext(
      { role: 'admin', userId: adminId, clientId: null, requestId: 'force-due' },
      async (c) => {
        await c.query(
          `update app.notifications set next_attempt_at = now() - interval '1 second' where id = $1`,
          [id],
        );
      },
    );
    const permanent = new DispatchNotifications(
      infra.workerUow,
      {
        send: async () => {
          throw new PermanentEmailError('dirección inválida');
        },
      },
      infra.clock,
      50,
      'http://localhost:3000',
    );
    await expect(permanent.execute('job-permanent')).resolves.toMatchObject({ failed: 1 });
    expect(await readNotification(id)).toMatchObject({ status: 'fallida', attempts: 2 });
  });

  it('T-RN10-03: dispatch cancela pendientes de una suscripción cancelada sin enviarlas', async () => {
    const sub = await createSubscription();
    const id = await insertNotification(sub, 'email');
    await withAppContext(
      { role: 'admin', userId: adminId, clientId: null, requestId: 'cancel-sub' },
      async (c) => {
        await c.query(
          `update app.subscriptions
              set status = 'cancelada', cancelled_at = now(), cancellation_reason = 'test'
            where id = $1`,
          [sub.id],
        );
      },
    );
    let called = false;
    const dispatch = new DispatchNotifications(
      infra.workerUow,
      {
        send: async () => {
          called = true;
          return { providerMessageId: 're_x' };
        },
      },
      infra.clock,
      50,
      'http://localhost:3000',
    );
    await expect(dispatch.execute('job-cancel')).resolves.toMatchObject({
      sent: 0,
      cancelled: 1,
    });
    expect(called).toBe(false);
    expect(await readNotification(id)).toMatchObject({ status: 'cancelada' });
  });

  it('maintenance.cleanup elimina idempotencia vencida', async () => {
    await withAppContext(
      { role: 'admin', userId: adminId, clientId: null, requestId: 'insert-idem' },
      async (c) => {
        await c.query(
          `insert into app.idempotency_keys
             (actor_type, actor_id, idem_key, request_method, request_path, request_hash, expires_at)
           values ('user',$1,'old-key-1','POST','/x','hash',now() - interval '2 days')`,
          [adminId],
        );
      },
    );
    const cleanup = new CleanupMaintenance(infra.workerUow, infra.clock);
    const result = await cleanup.execute('job-cleanup');
    expect(result.idempotencyKeys).toBe(1);
    expect(result.refreshTokens).toBe(0);
  });
});
