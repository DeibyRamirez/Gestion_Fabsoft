import type { NotificationChannel, RenewalOutcome, SubscriptionStatus } from '@fabsoft/shared';
import { addDays, compareLocalDate, type LocalDate } from '../subscriptions/local-date.js';

/** 08:00 America/Bogota (UTC-5, sin horario de verano). */
const ALERT_UTC_HOUR = 'T13:00:00.000Z';

export interface AlertRulePolicy {
  code: string;
  offsetDays: number;
  channels: readonly NotificationChannel[];
  appliesWhenNotRenewable: boolean;
  isActive: boolean;
}

export interface AlertSubscriptionState {
  status: SubscriptionStatus;
  isRenewable: boolean;
  renewalOutcome: RenewalOutcome;
}

export interface AlertRecipientCandidates {
  subscriptionOwnerId: string | null;
  clientOwnerId: string | null;
  activeAdminIds: readonly string[];
}

const INELIGIBLE_STATUSES = new Set<SubscriptionStatus>([
  'cancelled',
  'not_renewed',
  'pending_activation',
]);

/** RN-10: estados terminales/pendientes nunca reciben alertas de renovación. */
export function hasAlertEligibleStatus(status: SubscriptionStatus): boolean {
  return !INELIGIBLE_STATUSES.has(status);
}

/** Una suscripción cancelada o no renovable sólo recibe reglas con excepción. */
export function isRenewableForAlerts(state: AlertSubscriptionState): boolean {
  return state.isRenewable && state.renewalOutcome !== 'not_renewed';
}

export function ruleAppliesToSubscription(
  rule: AlertRulePolicy,
  state: AlertSubscriptionState,
): boolean {
  if (!rule.isActive || !hasAlertEligibleStatus(state.status)) return false;
  return isRenewableForAlerts(state) || rule.appliesWhenNotRenewable;
}

/** Fecha de la alerta: `period_end - offset_days` (offset negativo = después). */
export function alertTargetDate(periodEnd: LocalDate, offsetDays: number): LocalDate {
  return addDays(periodEnd, -offsetDays);
}

/** Programada a las 08:00 America/Bogota (13:00 UTC). */
export function alertScheduledFor(periodEnd: LocalDate, offsetDays: number): Date {
  return new Date(`${alertTargetDate(periodEnd, offsetDays)}${ALERT_UTC_HOUR}`);
}

/** No se generan alertas retroactivas para fechas anteriores a hoy. */
export function shouldScheduleOnOrAfter(targetDate: LocalDate, today: LocalDate): boolean {
  return compareLocalDate(targetDate, today) >= 0;
}

/** RN-08: una fila por suscripción/regla/periodo/canal/destinatario. */
export function alertDedupeKey(
  subscriptionId: string,
  ruleCode: string,
  periodEnd: LocalDate,
  channel: NotificationChannel,
  recipientUserId: string,
): string {
  return `exp:${subscriptionId}:${ruleCode}:${periodEnd}:${channel}:${recipientUserId}`;
}

/** Responsable de la suscripción → responsable del cliente → admins activos. */
export function resolveAlertRecipients(candidates: AlertRecipientCandidates): string[] {
  if (candidates.subscriptionOwnerId) return [candidates.subscriptionOwnerId];
  if (candidates.clientOwnerId) return [candidates.clientOwnerId];
  return [...new Set(candidates.activeAdminIds)];
}
