import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_EMAIL_TEMPLATE } from '@fabsoft/shared';
import { buildEmail, formatBusinessDate } from './email-content.js';
import type { DispatchableNotification } from './ports.js';

const item = (over: Partial<DispatchableNotification> = {}): DispatchableNotification => ({
  id: 'not-1',
  notificationType: 'expiration_alert',
  subscriptionId: 'sub-1',
  periodEnd: '2026-12-31',
  channel: 'email',
  recipientEmail: 'admin@fabsoft.test',
  recipientName: 'Ana Admin',
  clientName: 'Acme',
  productName: 'M365',
  ruleCode: 'D30',
  dedupeKey: 'exp:sub-1:D30:2026-12-31:email:u',
  attempts: 0,
  maxAttempts: 5,
  ...over,
});

const frontendUrl = 'https://app.fabsoft.test';

describe('email-content', () => {
  it('formatea la fecha de negocio para el correo', () => {
    expect(formatBusinessDate('2026-12-31')).toBe('31 dic 2026');
    expect(formatBusinessDate('2026-01-05')).toBe('5 ene 2026');
    expect(formatBusinessDate(null)).toBe('próximamente');
    expect(formatBusinessDate('texto')).toBe('texto');
  });

  it('genera la versión HTML de alerta con la identidad de FabSoft', () => {
    const email = buildEmail(item(), frontendUrl, DEFAULT_ALERT_EMAIL_TEMPLATE);

    expect(email.text).toContain('31 dic 2026');
    expect(email.html).toBeDefined();
    expect(email.html).toContain('lang="es"');
    expect(email.html).toContain('FabSoft');
    expect(email.html).toContain('#5B3DF5');
    expect(email.html).toContain('#0B1023');
    expect(email.html).toContain('Revisar suscripción');
    expect(email.html).toContain('30 días antes');
    expect(email.html).toContain('https://app.fabsoft.test/subscriptions/sub-1');
    expect(email.html).toContain('esto pide');
    expect(email.html).not.toContain('undefined');
  });

  it('escapa HTML del contenido dinámico', () => {
    const email = buildEmail(
      item({ clientName: '<script>alert(1)</script>', productName: 'A & B' }),
      frontendUrl,
      DEFAULT_ALERT_EMAIL_TEMPLATE,
    );

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('A &amp; B');
  });

  it('genera la versión HTML de una solicitud de renovación', () => {
    const email = buildEmail(
      item({
        notificationType: 'renewal_request_created',
        ruleCode: null,
      }),
      frontendUrl,
      DEFAULT_ALERT_EMAIL_TEMPLATE,
    );

    expect(email.subject).toBe('Nueva solicitud de renovación — Acme');
    expect(email.text).toContain('Acme solicitó renovar M365');
    expect(email.html).toContain('Revisar solicitud');
    expect(email.html).toContain('Pendiente de revisión');
    expect(email.html).toContain('https://app.fabsoft.test/renewal-requests');
    expect(email.html).toContain('una nueva');
  });
});
