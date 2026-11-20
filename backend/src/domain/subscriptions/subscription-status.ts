import type { SubscriptionStatus } from '@fabsoft/shared';
import { DomainError } from '../shared/domain-error.js';
import { compareLocalDate, type LocalDate } from './local-date.js';

export const TERMINAL_STATUSES: readonly SubscriptionStatus[] = ['cancelada', 'no_renovada'];

const TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  pendiente_activacion: ['activa', 'cancelada'],
  activa: ['en_renovacion', 'vencida', 'cancelada', 'no_renovada'],
  en_renovacion: ['activa', 'vencida', 'cancelada', 'no_renovada'],
  vencida: ['activa', 'en_renovacion', 'cancelada', 'no_renovada'],
  cancelada: [],
  no_renovada: [],
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError('invalid_state_transition', `Transición inválida: ${from} → ${to}`);
  }
}

/** Toda creación nace pendiente de activación (la activación es un paso aparte). */
export function initialStatus(): SubscriptionStatus {
  return 'pendiente_activacion';
}

/**
 * Vencida ⇔ `hoy > fin` (fin inclusivo, America/Bogota). Nunca depende del pago
 * (RN-07) ni toca estados terminales.
 */
export function evaluateExpiration(
  status: SubscriptionStatus,
  currentPeriodEnd: LocalDate,
  today: LocalDate,
): SubscriptionStatus {
  if (status !== 'activa' && status !== 'en_renovacion') return status;
  return compareLocalDate(today, currentPeriodEnd) > 0 ? 'vencida' : status;
}
