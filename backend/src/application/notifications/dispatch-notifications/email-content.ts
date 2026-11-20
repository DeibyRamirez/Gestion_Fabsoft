import type { AlertEmailTemplate } from '@fabsoft/shared';
import type { EmailMessage } from '../shared/email-sender.js';
import type { DispatchableNotification } from './ports.js';

export type AlertEmailVariables = {
  recipientName: string;
  clientName: string;
  productName: string;
  periodEnd: string;
  ruleCode: string;
  subscriptionUrl: string;
  frontendUrl: string;
};

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
  const link = n.subscriptionId ? `${frontendUrl}/subscriptions/${n.subscriptionId}` : frontendUrl;
  if (n.notificationType === 'renewal_request_created') {
    return {
      to: n.recipientEmail,
      subject: `Nueva solicitud de renovación — ${client}`,
      text: `Hola ${n.recipientName},\n\n${client} solicitó renovar ${product}.\n\nRevisa la solicitud en ${frontendUrl}/renewal-requests.\n`,
      idempotencyKey: n.dedupeKey,
    };
  }

  const rendered = renderAlertEmailTemplate(template, {
    recipientName: n.recipientName,
    clientName: client,
    productName: product,
    periodEnd: n.periodEnd ?? 'próximamente',
    ruleCode: n.ruleCode ?? 'renovación',
    subscriptionUrl: link,
    frontendUrl,
  });
  return {
    to: n.recipientEmail,
    subject: rendered.subject,
    text: rendered.text,
    idempotencyKey: n.dedupeKey,
  };
}
