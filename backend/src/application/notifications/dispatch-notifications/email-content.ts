import type { EmailMessage } from '../shared/email-sender.js';
import type { DispatchableNotification } from './ports.js';

export function buildEmail(n: DispatchableNotification, frontendUrl: string): EmailMessage {
  const client = n.clientName ?? 'el cliente';
  const product = n.productName ?? 'la suscripción';
  const link = n.subscriptionId ? `${frontendUrl}/subscriptions/${n.subscriptionId}` : frontendUrl;
  if (n.notificationType === 'renewal_request_created') {
    return {
      to: n.recipientEmail,
      subject: `Nueva solicitud de renovación · ${client}`,
      text: `Hola ${n.recipientName},\n\n${client} solicitó renovar ${product}.\n\nRevisa la solicitud en ${frontendUrl}/renewal-requests.\n`,
      idempotencyKey: n.dedupeKey,
    };
  }
  return {
    to: n.recipientEmail,
    subject: `Recordatorio de renovación · ${client}`,
    text:
      `Hola ${n.recipientName},\n\n` +
      `La suscripción de ${client} a ${product} vence el ${n.periodEnd ?? 'próximamente'}.\n` +
      `Alerta: ${n.ruleCode ?? 'renovación'}.\n\n` +
      `Revisa la suscripción en ${link}\n`,
    idempotencyKey: n.dedupeKey,
  };
}
