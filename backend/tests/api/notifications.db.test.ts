import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

describe.skipIf(!dbTestsConfigured())('Notifications API (Postgres)', () => {
  let factories: Factories;
  let today: LocalDate;
  let admin: FactoryUser;

  beforeAll(async () => {
    factories = createFactories({ tokens: await getTestAccessTokens() });
    today = toBogotaLocalDate(new Date());
  });

  beforeEach(async () => {
    factories.reseed();
    await resetDatabase();
    admin = await factories.adminUser();
    await withAppContext(
      { role: 'admin', userId: admin.id, clientId: null, requestId: 'seed-alert-rules' },
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
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  async function createActivated(ownerUserId: string | null = admin.id) {
    const app = await buildTestApp();
    const client = await factories.client();
    const product = await factories.product();
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);
    const created = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId: client.id,
        productId: product.id,
        startDate: today,
        currentPeriodEnd: addDays(today, 30),
        billingCycle: 'monthly',
        priceAmount: '100000.00',
        ownerUserId,
      });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    await request(app)
      .post(`/api/v1/subscriptions/${id}/activate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1 })
      .expect(200);
    return { app, id, token, client, operator };
  }

  async function updateNotification(sql: string, params: unknown[]) {
    return withAppContext(
      { role: 'admin', userId: admin.id, clientId: null, requestId: 'notifications-test' },
      async (c) => {
        const { rows } = await c.query<{ id: string }>(sql, params);
        return rows;
      },
    );
  }

  async function notificationRows(subscriptionId: string) {
    return withAppContext(
      { role: 'admin', userId: admin.id, clientId: null, requestId: 'notifications-test' },
      async (c) => {
        const { rows } = await c.query<{
          id: string;
          channel: string;
          status: string;
          rule_code: string;
          recipient_user_id: string;
          alert_rule_id: string;
          dedupe_key: string;
        }>(
          `select n.id, n.channel, n.status, r.code as rule_code, n.recipient_user_id,
                  n.alert_rule_id, n.dedupe_key
             from app.notifications n
             left join app.alert_rules r on r.id = n.alert_rule_id
            where n.subscription_id = $1
            order by r.code, n.channel`,
          [subscriptionId],
        );
        return rows;
      },
    );
  }

  it('T-NOT-01 — lista, filtra, marca leída y cuenta no leídas', async () => {
    const { app, id } = await createActivated();
    const rows = await notificationRows(id);
    expect(rows).toHaveLength(11);
    const inApp = rows.find((r) => r.channel === 'in_app' && r.rule_code === 'D30')!;
    await updateNotification(
      `update app.notifications set status = 'sent', sent_at = now() where id = $1 returning id`,
      [inApp.id],
    );
    const adminToken = await factories.tokenFor(admin);

    const mine = await request(app)
      .get('/api/v1/notifications?mine=true')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(mine.status).toBe(200);
    expectMatchesOperation(mine, 'listNotifications');
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.meta.unreadCount).toBe(1);
    expect(mine.body.data[0].title).toContain('Preparar renovación');

    const all = await request(app)
      .get(`/api/v1/notifications?subscriptionId=${id}&channel=email`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(5);
    expect(all.body.data.every((n: { channel: string }) => n.channel === 'email')).toBe(true);

    const read = await request(app)
      .post(`/api/v1/notifications/${inApp.id}/read`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(read.status).toBe(204);

    const again = await request(app)
      .post(`/api/v1/notifications/${inApp.id}/read`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(again.status).toBe(204);

    const after = await request(app)
      .get('/api/v1/notifications?mine=true')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(after.body.data[0].readAt).not.toBeNull();
    expect(after.body.meta.unreadCount).toBe(0);
  });

  it('T-NOT-02 — sólo el destinatario puede marcar leída su alerta in-app', async () => {
    const { app, id } = await createActivated();
    const rows = await notificationRows(id);
    const inApp = rows.find((r) => r.channel === 'in_app')!;
    await updateNotification(
      `update app.notifications set status = 'sent', sent_at = now() where id = $1 returning id`,
      [inApp.id],
    );
    const operator = await factories.operatorUser();
    const token = await factories.tokenFor(operator);
    const res = await request(app)
      .post(`/api/v1/notifications/${inApp.id}/read`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('T-NOT-03 — reintenta failed y rechaza obsoleta; cliente 403', async () => {
    const { app, id, client } = await createActivated();
    const rows = await notificationRows(id);
    const failed = rows.find((r) => r.channel === 'email')!;
    await updateNotification(
      `update app.notifications
          set status = 'failed', attempts = max_attempts, last_error = 'fallo'
        where id = $1 returning id`,
      [failed.id],
    );
    const adminToken = await factories.tokenFor(admin);
    const retried = await request(app)
      .post(`/api/v1/notifications/${failed.id}/retry`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(retried.status).toBe(200);
    expectMatchesOperation(retried, 'retryNotification');
    expect(retried.body.status).toBe('pending');
    expect(retried.body.attempts).toBe(0);

    const obsoleteId = await updateNotification(
      `insert into app.notifications
         (notification_type, subscription_id, alert_rule_id, period_end, channel,
          recipient_user_id, scheduled_for, status, attempts, max_attempts, last_error, dedupe_key)
       values ('expiration_alert',$1,$2,$3,'email',$4,now(),'failed',5,5,'fallo',$5)
       returning id`,
      [id, failed.alert_rule_id, addDays(today, -30), admin.id, randomKey()],
    ).then((r) => r[0]!.id);
    const obsolete = await request(app)
      .post(`/api/v1/notifications/${obsoleteId}/retry`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(obsolete.status).toBe(422);
    expect(obsolete.body.code).toBe('notification_obsolete');

    const clientUser = await factories.clientUser(client);
    const clientToken = await factories.tokenFor(clientUser);
    const forbidden = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(forbidden.status).toBe(403);
  });
});

const randomKey = () => `exp:test:${randomUUID()}`;
