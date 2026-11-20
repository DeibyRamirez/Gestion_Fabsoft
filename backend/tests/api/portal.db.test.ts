import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PortalMeSchema,
  PortalRenewalRequestPageSchema,
  PortalRenewalRequestSchema,
  PortalSubscriptionPageSchema,
  PortalSubscriptionSchema,
  type PortalPeriod,
} from '@fabsoft/shared';
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

describe.skipIf(!dbTestsConfigured())('Portal API (Postgres)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let factories: Factories;
  let admin: FactoryUser;
  let operator: FactoryUser;
  let client: FactoryUser;
  let clientRowId: string;
  let subscriptionId: string;
  let otherSubscriptionId: string;
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
    await withAppContext(
      { userId: admin.id, role: 'admin', clientId: null, requestId: 'portal-test' },
      async (c) => {
        await c.query(
          `insert into app.app_settings (key, value)
           values ('contact_channel', $1::jsonb)`,
          [
            JSON.stringify({
              email: 'contacto@fabsoft.test',
              phone: '+57 300 000 0000',
              hours: 'Lunes a viernes, 8:00-17:00',
            }),
          ],
        );
      },
    );

    operator = await factories.operatorUser();
    const clientRow = await factories.client({ status: 'activo' });
    clientRowId = clientRow.id;
    client = await factories.user({ role: 'client', clientId: clientRowId });
    const otherClientRow = await factories.client({ status: 'activo' });

    const product = await factories.product();
    subscriptionId = (
      await factories.subscription(clientRow, product, {
        status: 'activa',
        startDate: toBogotaLocalDate(new Date()),
      })
    ).id;
    otherSubscriptionId = (
      await factories.subscription(otherClientRow, product, {
        status: 'activa',
        startDate: toBogotaLocalDate(new Date()),
      })
    ).id;

    operatorToken = await factories.tokenFor(operator);
    clientToken = await factories.tokenFor(client);
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  it('T-RN11 — el cliente ve su organización, contacto y sólo sus suscripciones visibles', async () => {
    const me = await request(app).get('/api/v1/portal/me').set(auth(clientToken));
    expect(me.status).toBe(200);
    expectMatchesOperation(me, 'getPortalMe');
    expect(PortalMeSchema.parse(me.body)).toMatchObject({
      organization: { id: clientRowId },
      contactChannel: { email: 'contacto@fabsoft.test' },
    });

    const list = await request(app).get('/api/v1/portal/subscriptions').set(auth(clientToken));
    expect(list.status).toBe(200);
    expectMatchesOperation(list, 'listPortalSubscriptions');
    const page = PortalSubscriptionPageSchema.parse(list.body);
    expect(page.data.map((s) => s.id)).toEqual([subscriptionId]);
    expect(page.data[0]!.productName).toBeTruthy();
    expect(page.data[0]!.hasOpenRenewalRequest).toBe(false);

    const foreign = await request(app)
      .get(`/api/v1/portal/subscriptions/${otherSubscriptionId}`)
      .set(auth(clientToken));
    expect(foreign.status).toBe(404);

    const detail = await request(app)
      .get(`/api/v1/portal/subscriptions/${subscriptionId}`)
      .set(auth(clientToken));
    expect(detail.status).toBe(200);
    expectMatchesOperation(detail, 'getPortalSubscription');
    expect(PortalSubscriptionSchema.parse(detail.body).id).toBe(subscriptionId);
    expect(detail.body.supplierCostAmount).toBeUndefined();
    expect(detail.body.notes).toBeUndefined();

    const periods = await request(app)
      .get(`/api/v1/portal/subscriptions/${subscriptionId}/periods`)
      .set(auth(clientToken));
    expect(periods.status).toBe(200);
    expectMatchesOperation(periods, 'listPortalSubscriptionPeriods');
    expect((periods.body.data as PortalPeriod[]).length).toBe(1);
  });

  it('T-RN05-01 — crear solicitud no renueva y genera tarea + notificaciones', async () => {
    const before = await withAppContext(
      { userId: admin.id, role: 'admin', clientId: null, requestId: 'portal-test' },
      async (c) => {
        const { rows } = await c.query(
          `select status::text, current_period_end::text from app.subscriptions where id = $1`,
          [subscriptionId],
        );
        return rows[0]!;
      },
    );

    const created = await request(app)
      .post('/api/v1/portal/renewal-requests')
      .set(auth(clientToken))
      .set('Idempotency-Key', randomUUID())
      .send({ subscriptionId, comment: 'Queremos continuar un año más' });
    expect(created.status).toBe(201);
    expectMatchesOperation(created, 'createPortalRenewalRequest');
    const dto = PortalRenewalRequestSchema.parse(created.body);
    expect(dto).toMatchObject({
      subscriptionId,
      status: 'pendiente_revision',
      comment: 'Queremos continuar un año más',
    });

    const after = await withAppContext(
      { userId: admin.id, role: 'admin', clientId: null, requestId: 'portal-test' },
      async (c) => {
        const sub = await c.query(
          `select status::text, current_period_end::text from app.subscriptions where id = $1`,
          [subscriptionId],
        );
        const req = await c.query(
          `select status::text, requested_by_user_id::text
             from app.renewal_requests where id = $1`,
          [dto.id],
        );
        const task = await c.query(
          `select task_type::text, renewal_request_id::text, dedupe_key, assignee_user_id::text
             from app.tasks where renewal_request_id = $1`,
          [dto.id],
        );
        const notifications = await c.query(
          `select channel::text, recipient_user_id::text
             from app.notifications where renewal_request_id = $1 order by channel`,
          [dto.id],
        );
        return {
          sub: sub.rows[0]!,
          req: req.rows[0]!,
          tasks: task.rows,
          notifications: notifications.rows,
        };
      },
    );

    expect(after.sub).toEqual(before);
    expect(after.req).toMatchObject({
      status: 'pendiente_revision',
      requested_by_user_id: client.id,
    });
    expect(after.tasks).toHaveLength(1);
    expect(after.tasks[0]).toMatchObject({
      task_type: 'review_renewal_request',
      renewal_request_id: dto.id,
      dedupe_key: `request:${dto.id}`,
    });
    expect(after.notifications).toHaveLength(2);
    expect(after.notifications.map((n) => n.channel).sort()).toEqual(['email', 'in_app']);

    const portalList = await request(app)
      .get('/api/v1/portal/renewal-requests')
      .set(auth(clientToken));
    expect(portalList.status).toBe(200);
    expectMatchesOperation(portalList, 'listPortalRenewalRequests');
    expect(PortalRenewalRequestPageSchema.parse(portalList.body).meta.total).toBe(1);

    const byId = await request(app)
      .get(`/api/v1/portal/renewal-requests/${dto.id}`)
      .set(auth(clientToken));
    expect(byId.status).toBe(200);
    expectMatchesOperation(byId, 'getPortalRenewalRequest');
    expect(PortalRenewalRequestSchema.parse(byId.body).id).toBe(dto.id);

    const internal = await request(app)
      .get('/api/v1/renewal-requests')
      .set(auth(operatorToken));
    expect(internal.status).toBe(200);
    expect(
      internal.body.data.some((r: { id: string; requestedBy: { actorType: string } }) => r.id === dto.id),
    ).toBe(true);
  });

  it('T-RN05-01 — operador puede crear solicitudes internas y el cliente no', async () => {
    const created = await request(app)
      .post('/api/v1/renewal-requests')
      .set(auth(operatorToken))
      .send({ subscriptionId, comment: 'Llamar al cliente' });
    expect(created.status).toBe(201);
    expectMatchesOperation(created, 'createRenewalRequest');
    expect(created.body).toMatchObject({
      subscriptionId,
      status: 'pendiente_revision',
      requestedBy: { actorType: 'user', id: operator.id },
    });

    const forbidden = await request(app)
      .post('/api/v1/renewal-requests')
      .set(auth(clientToken))
      .send({ subscriptionId });
    expect(forbidden.status).toBe(403);
  });

  it('T-RN11 — oculta suscripciones con visibleInPortal=false y rechaza terminales', async () => {
    await withAppContext(
      { userId: admin.id, role: 'admin', clientId: null, requestId: 'portal-test' },
      async (c) => {
        await c.query(`update app.subscriptions set visible_in_portal = false where id = $1`, [
          subscriptionId,
        ]);
      },
    );
    const list = await request(app).get('/api/v1/portal/subscriptions').set(auth(clientToken));
    expect(list.status).toBe(200);
    expect(PortalSubscriptionPageSchema.parse(list.body).data).toHaveLength(0);
    expect(
      (
        await request(app)
          .get(`/api/v1/portal/subscriptions/${subscriptionId}`)
          .set(auth(clientToken))
      ).status,
    ).toBe(404);

    await withAppContext(
      { userId: admin.id, role: 'admin', clientId: null, requestId: 'portal-test' },
      async (c) => {
        await c.query(
          `update app.subscriptions
              set visible_in_portal = true, status = 'cancelada', cancelled_at = now()
            where id = $1`,
          [subscriptionId],
        );
      },
    );
    expect(
      (
        await request(app)
          .post('/api/v1/portal/renewal-requests')
          .set(auth(clientToken))
          .send({ subscriptionId })
      ).status,
    ).toBe(422);
  });
});
