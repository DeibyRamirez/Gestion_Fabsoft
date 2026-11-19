import type { BillingCycle, SubscriptionStatus } from '@fabsoft/shared';
import { DomainError } from '../shared/domain-error.js';
import { computePeriodEnd, nextPeriodStart } from './billing-cycle.js';
import { assertNoOverlap } from './period.js';
import { assertLocalDate, compareLocalDate, type LocalDate } from './local-date.js';
import { initialStatus } from './subscription-status.js';

export interface SubscriptionCreationInput {
  startDate: LocalDate;
  currentPeriodEnd?: LocalDate;
  billingCycle: BillingCycle;
  customCycleMonths?: number | null;
  priceAmount: number;
}

export interface ResolvedSubscription {
  startDate: LocalDate;
  currentPeriodEnd: LocalDate;
  billingCycle: BillingCycle;
  customCycleMonths: number | null;
  priceAmount: number;
  status: SubscriptionStatus;
}

/**
 * Normaliza el alta de una suscripción (RN-01, RN-03, RN-09): valida fechas,
 * coherencia de ciclo custom, precio congelado y estado inicial pendiente.
 */
export function resolveSubscription(input: SubscriptionCreationInput): ResolvedSubscription {
  const startDate = assertLocalDate(input.startDate);
  const customCycleMonths = input.customCycleMonths ?? null;

  if ((input.billingCycle === 'custom') !== (customCycleMonths !== null)) {
    throw new DomainError(
      'validation_error',
      'customCycleMonths sólo se informa (y es obligatorio) con billingCycle=custom',
      [{ path: 'customCycleMonths', message: String(customCycleMonths) }],
    );
  }
  if (!Number.isFinite(input.priceAmount) || input.priceAmount < 0) {
    throw new DomainError('validation_error', 'priceAmount debe ser >= 0', [
      { path: 'priceAmount', message: String(input.priceAmount) },
    ]);
  }

  const currentPeriodEnd =
    input.currentPeriodEnd === undefined
      ? computePeriodEnd(startDate, input.billingCycle, customCycleMonths)
      : assertLocalDate(input.currentPeriodEnd);

  if (compareLocalDate(currentPeriodEnd, startDate) < 0) {
    throw new DomainError('validation_error', 'currentPeriodEnd debe ser >= startDate', [
      { path: 'currentPeriodEnd', message: currentPeriodEnd },
    ]);
  }

  return {
    startDate,
    currentPeriodEnd,
    billingCycle: input.billingCycle,
    customCycleMonths,
    priceAmount: input.priceAmount,
    status: initialStatus(),
  };
}

/**
 * Corrige el fin del periodo vigente (Flujo E): nunca anterior al inicio del
 * periodo y con la misma convención de fecha inclusiva (RN-03).
 */
export function resolveExpirationCorrection(
  currentPeriodStart: LocalDate,
  newCurrentPeriodEnd: LocalDate,
): LocalDate {
  const endDate = assertLocalDate(newCurrentPeriodEnd);
  if (compareLocalDate(endDate, currentPeriodStart) < 0) {
    throw new DomainError(
      'validation_error',
      'newCurrentPeriodEnd debe ser >= el inicio del periodo vigente',
      [{ path: 'newCurrentPeriodEnd', message: endDate }],
    );
  }
  return endDate;
}

export interface RenewalInput {
  currentPeriodEnd: LocalDate;
  currentBillingCycle: BillingCycle;
  currentCustomCycleMonths: number | null;
  newStartDate?: LocalDate;
  newEndDate?: LocalDate;
  billingCycle?: BillingCycle;
  customCycleMonths?: number | null;
}

export interface ResolvedRenewal {
  startDate: LocalDate;
  endDate: LocalDate;
  billingCycle: BillingCycle;
  customCycleMonths: number | null;
}

/**
 * Calcula el periodo nuevo de una renovación (RN-04/RN-05): por defecto empieza en
 * `fin actual + 1`, no se solapa y el fin se deriva del ciclo.
 */
export function resolveRenewal(input: RenewalInput): ResolvedRenewal {
  const startDate =
    input.newStartDate === undefined
      ? nextPeriodStart(input.currentPeriodEnd)
      : assertLocalDate(input.newStartDate);
  assertNoOverlap(input.currentPeriodEnd, startDate);

  const billingCycle = input.billingCycle ?? input.currentBillingCycle;
  const customCycleMonths =
    billingCycle === 'custom' ? (input.customCycleMonths ?? input.currentCustomCycleMonths) : null;
  if (billingCycle === 'custom' && (customCycleMonths === null || customCycleMonths < 1)) {
    throw new DomainError('validation_error', 'customCycleMonths es obligatorio con ciclo custom', [
      { path: 'customCycleMonths', message: String(customCycleMonths) },
    ]);
  }

  const endDate =
    input.newEndDate === undefined
      ? computePeriodEnd(startDate, billingCycle, customCycleMonths)
      : assertLocalDate(input.newEndDate);
  if (compareLocalDate(endDate, startDate) < 0) {
    throw new DomainError('validation_error', 'El fin del periodo debe ser >= el inicio', [
      { path: 'endDate', message: endDate },
    ]);
  }

  return { startDate, endDate, billingCycle, customCycleMonths };
}
