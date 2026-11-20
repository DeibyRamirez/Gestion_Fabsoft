import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlertEmailTemplateSchema, AlertRuleListSchema, ProblemSchema } from '@fabsoft/shared';
import { createFactories, type Factories, type FactoryUser } from '../fixtures/factories.js';
import { buildTestApp, closeTestApp, getTestAccessTokens } from '../helpers/app.js';
import {
  assertDbTestsRequired,
  closeTestPools,
  dbTestsConfigured,
  resetDatabase,
  withAppContext,
} from '../helpers/db.js';
import { expectMatchesOperation } from '../helpers/openapi.js';

assertDbTestsRequired();

describe.skipIf(!dbTestsConfigured())('Alert rules API (Postgres)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let factories: Factories;
  let admin: FactoryUser;
  let operator: FactoryUser;
  let client: FactoryUser;
  let adminToken: string;
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
    operator = await factories.operatorUser();
    const clientRow = await factories.client();
    client = await factories.user({ role: 'client', clientId: clientRow.id });
    adminToken = await factories.tokenFor(admin);
    operatorToken = await factories.tokenFor(operator);
    clientToken = await factories.tokenFor(client);
  });

  afterAll(async () => {
    await closeTestApp();
    await closeTestPools();
  });

  it('GET devuelve las 6 reglas para admin/operator y 403 para cliente', async () => {
    const adminRes = await request(app).get('/api/v1/alert-rules').set(auth(adminToken));
    expect(adminRes.status).toBe(200);
    expectMatchesOperation(adminRes, 'listAlertRules');
    const list = AlertRuleListSchema.parse(adminRes.body);
    expect(list.data.map((rule) => rule.code)).toEqual(['D30', 'D15', 'D7', 'D1', 'D0', 'POST1']);

    expect((await request(app).get('/api/v1/alert-rules').set(auth(operatorToken))).status).toBe(
      200,
    );
    expect((await request(app).get('/api/v1/alert-rules').set(auth(clientToken))).status).toBe(403);
  });

  it('PATCH cambia el umbral, audita before/after y se refleja en GET', async () => {
    const list = AlertRuleListSchema.parse(
      (await request(app).get('/api/v1/alert-rules').set(auth(adminToken))).body,
    );
    const d30 = list.data.find((rule) => rule.code === 'D30')!;
    const updated = await request(app)
      .patch(`/api/v1/alert-rules/${d30.id}`)
      .set(auth(adminToken))
      .send({ offsetDays: 45, description: 'Preparar la renovación (45 días antes)' });
    expect(updated.status).toBe(200);
    expectMatchesOperation(updated, 'updateAlertRule');
    expect(updated.body.offsetDays).toBe(45);

    const after = AlertRuleListSchema.parse(
      (await request(app).get('/api/v1/alert-rules').set(auth(adminToken))).body,
    );
    expect(after.data.find((rule) => rule.code === 'D30')?.offsetDays).toBe(45);

    const audit = await request(app)
      .get('/api/v1/audit-logs?action=alert_rule.updated')
      .set(auth(adminToken));
    expect(audit.status).toBe(200);
    expect(audit.body.data).toHaveLength(1);
    expect(audit.body.data[0].changes.before.offset_days).toBe(30);
    expect(audit.body.data[0].changes.after.offset_days).toBe(45);
  });

  it('rechaza un umbral duplicado con 409 alert_rule_offset_taken', async () => {
    const list = AlertRuleListSchema.parse(
      (await request(app).get('/api/v1/alert-rules').set(auth(adminToken))).body,
    );
    const d30 = list.data.find((rule) => rule.code === 'D30')!;

    const res = await request(app)
      .patch(`/api/v1/alert-rules/${d30.id}`)
      .set(auth(adminToken))
      .send({ offsetDays: 7 });

    expect(res.status).toBe(409);
    expect(ProblemSchema.parse(res.body).code).toBe('alert_rule_offset_taken');
  });

  it('valida coherencia de tarea y canales duplicados', async () => {
    const list = AlertRuleListSchema.parse(
      (await request(app).get('/api/v1/alert-rules').set(auth(adminToken))).body,
    );
    const d7 = list.data.find((rule) => rule.code === 'D7')!;

    const badTask = await request(app)
      .patch(`/api/v1/alert-rules/${d7.id}`)
      .set(auth(adminToken))
      .send({ createsTask: true });
    expect(badTask.status).toBe(400);
    expect(ProblemSchema.parse(badTask.body).code).toBe('validation_error');

    const badChannels = await request(app)
      .patch(`/api/v1/alert-rules/${d7.id}`)
      .set(auth(adminToken))
      .send({ channels: ['in_app', 'in_app'] });
    expect(badChannels.status).toBe(400);
    expect(ProblemSchema.parse(badChannels.body).code).toBe('validation_error');
  });

  it('operator lee pero no edita; cliente no accede', async () => {
    const list = AlertRuleListSchema.parse(
      (await request(app).get('/api/v1/alert-rules').set(auth(adminToken))).body,
    );
    const d30 = list.data.find((rule) => rule.code === 'D30')!;

    expect(
      (
        await request(app)
          .patch(`/api/v1/alert-rules/${d30.id}`)
          .set(auth(operatorToken))
          .send({ offsetDays: 45 })
      ).status,
    ).toBe(403);

    expect(
      (
        await request(app)
          .patch(`/api/v1/alert-rules/${d30.id}`)
          .set(auth(clientToken))
          .send({ offsetDays: 45 })
      ).status,
    ).toBe(403);
  });

  it('GET/PATCH plantilla de correo con auditoría', async () => {
    const initial = await request(app)
      .get('/api/v1/alert-rules/email-template')
      .set(auth(adminToken));
    expect(initial.status).toBe(200);
    expectMatchesOperation(initial, 'getAlertEmailTemplate');
    expect(AlertEmailTemplateSchema.parse(initial.body).subject).toContain('{{clientName}}');

    const updated = await request(app)
      .patch('/api/v1/alert-rules/email-template')
      .set(auth(adminToken))
      .send({
        subject: 'Aviso para {{clientName}}',
        body: 'Hola {{recipientName}}, revisa {{subscriptionUrl}}.',
      });
    expect(updated.status).toBe(200);
    expectMatchesOperation(updated, 'updateAlertEmailTemplate');
    expect(AlertEmailTemplateSchema.parse(updated.body)).toMatchObject({
      subject: 'Aviso para {{clientName}}',
    });

    const after = await request(app)
      .get('/api/v1/alert-rules/email-template')
      .set(auth(operatorToken));
    expect(after.status).toBe(200);
    expect(after.body.subject).toBe('Aviso para {{clientName}}');

    const audit = await request(app)
      .get('/api/v1/audit-logs?action=app_setting.updated')
      .set(auth(adminToken));
    expect(audit.status).toBe(200);
    expect(audit.body.data).toHaveLength(1);
    expect(audit.body.data[0].resourceId).toBe('alert_email_template');
    expect(audit.body.data[0].changes.before.value.subject).toBe(initial.body.subject);
    expect(audit.body.data[0].changes.after.value.subject).toBe('Aviso para {{clientName}}');
  });

  it('rechaza placeholders desconocidos y edición por operator/client', async () => {
    const invalid = await request(app)
      .patch('/api/v1/alert-rules/email-template')
      .set(auth(adminToken))
      .send({ subject: 'Hola {{unknown}}', body: 'Cuerpo válido' });
    expect(invalid.status).toBe(400);
    expect(ProblemSchema.parse(invalid.body).code).toBe('validation_error');

    expect(
      (
        await request(app)
          .patch('/api/v1/alert-rules/email-template')
          .set(auth(operatorToken))
          .send({ subject: 'Hola', body: 'Cuerpo válido' })
      ).status,
    ).toBe(403);

    expect(
      (await request(app).get('/api/v1/alert-rules/email-template').set(auth(clientToken))).status,
    ).toBe(403);
  });
});
