import type { AlertEmailTemplate } from '@fabsoft/shared';
import type { EmailMessage } from '../shared/email-sender.js';
import type { DispatchableNotification } from './ports.js';
import { renderEmailHtml } from './email-layout.js';

export type AlertEmailVariables = {
  recipientName: string;
  clientName: string;
  productName: string;
  periodEnd: string;
  ruleCode: string;
  subscriptionUrl: string;
  frontendUrl: string;
};

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const RULE_LABELS: Record<string, string> = {
  D30: '30 días antes',
  D15: '15 días antes',
  D7: '7 días antes',
  D1: '1 día antes',
  D0: 'Día del vencimiento',
  POST1: '1 día después',
};

/** Fecha de negocio `YYYY-MM-DD` al formato visible `d MMM yyyy`. */
export function formatBusinessDate(value: string | null | undefined): string {
  if (!value) return 'próximamente';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!day || !month || month < 1 || month > 12 || day < 1 || day > 31) return value;
  return `${day} ${MONTHS_ES[month - 1]} ${match[1]}`;
}

/** Quita del cuerpo HTML la línea que repite el enlace del botón (el texto plano la conserva). */
function withoutUrlLine(text: string, url: string): string {
  return text
    .split('\n')
    .filter((line) => !line.includes(url))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderAlertEmailTemplate(
  template: AlertEmailTemplate,
  variables: AlertEmailVariables,
): { subject: string; text: string } {
  const replace = (value: string): string =>
    value.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (_match, key: string) => {
      const replacement = variables[key as keyof AlertEmailVariables];
      return replacement ?? '';
    });

  return {
    subject: replace(template.subject),
    text: replace(template.body),
  };
}

export function buildEmail(
  n: DispatchableNotification,
  frontendUrl: string,
  template: AlertEmailTemplate,
): EmailMessage {
  const client = n.clientName ?? 'el cliente';
  const product = n.productName ?? 'la suscripción';
  const periodEnd = formatBusinessDate(n.periodEnd);
  const link = n.subscriptionId ? `${frontendUrl}/subscriptions/${n.subscriptionId}` : frontendUrl;
  const ruleLabel = n.ruleCode ? (RULE_LABELS[n.ruleCode] ?? n.ruleCode) : 'Renovación';

  if (n.notificationType === 'renewal_request_created') {
    const requestUrl = `${frontendUrl}/renewal-requests`;
    const text = `Hola ${n.recipientName},\n\n${client} solicitó renovar ${product}.\n\nRevisa la solicitud en ${requestUrl}.\n`;
    const htmlText = `Hola ${n.recipientName},\n\n${client} solicitó renovar ${product}.\n`;
    const details = [
      { label: 'Cliente', value: client },
      { label: 'Producto', value: product },
      ...(n.periodEnd ? [{ label: 'Vence', value: periodEnd }] : []),
      { label: 'Estado', value: 'Pendiente de revisión', badge: true },
    ];

    return {
      to: n.recipientEmail,
      subject: `Nueva solicitud de renovación — ${client}`,
      text,
      html: renderEmailHtml({
        subject: `Nueva solicitud de renovación — ${client}`,
        preheader: `${client} solicitó renovar ${product}.`,
        eyebrow: 'Nueva solicitud',
        title: 'una nueva',
        accent: 'solicitud.',
        bodyText: htmlText,
        details,
        ctaLabel: 'Revisar solicitud',
        ctaUrl: requestUrl,
        footerNote:
          'La solicitud no confirma la renovación ni el pago; solo inicia la revisión del equipo.',
      }),
      idempotencyKey: n.dedupeKey,
    };
  }

  const rendered = renderAlertEmailTemplate(template, {
    recipientName: n.recipientName,
    clientName: client,
    productName: product,
    periodEnd,
    ruleCode: n.ruleCode ?? 'renovación',
    subscriptionUrl: link,
    frontendUrl,
  });
  const details = [
    { label: 'Cliente', value: client },
    { label: 'Producto', value: product },
    { label: 'Vence', value: periodEnd },
    { label: 'Alerta', value: ruleLabel, badge: true },
  ];

  return {
    to: n.recipientEmail,
    subject: rendered.subject,
    text: rendered.text,
    html: renderEmailHtml({
      subject: rendered.subject,
      preheader: `La suscripción de ${client} a ${product} vence el ${periodEnd}.`,
      eyebrow: 'Alerta de renovación',
      title: 'esto pide',
      accent: 'atención hoy.',
      bodyText: withoutUrlLine(rendered.text, link),
      details,
      ctaLabel: 'Revisar suscripción',
      ctaUrl: link,
      footerNote:
        'Esta alerta se generó a partir de las reglas de renovación configuradas en FabSoft.',
    }),
    idempotencyKey: n.dedupeKey,
  };
}
