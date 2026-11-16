import type { SubscriptionStatus } from '@fabsoft/shared';
import { DomainError } from '../shared/domain-error.js';
import { compareLocalDate, type LocalDate } from './local-date.js';

export const TERMINAL_STATUSES: readonly SubscriptionStatus[] = ['cancelled', 'not_renewed'];

const TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  pending_activation: ['active', 'cancelled'],
  active: ['in_renewal', 'expired', 'cancelled', 'not_renewed'],
  in_renewal: ['active', 'expired', 'cancelled', 'not_renewed'],
  expired: ['active', 'in_renewal', 'cancelled', 'not_renewed'],
  cancelled: [],
  not_renewed: [],
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
  return 'pending_activation';
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
  if (status !== 'active' && status !== 'in_renewal') return status;
  return compareLocalDate(today, currentPeriodEnd) > 0 ? 'expired' : status;
}
