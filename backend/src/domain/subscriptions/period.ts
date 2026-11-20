import type { BillingCycle, PaymentStatus, RenewalOutcome } from '@fabsoft/shared';
import { DomainError } from '../shared/domain-error.js';
import { nextPeriodStart } from './billing-cycle.js';
import { compareLocalDate, type LocalDate } from './local-date.js';

export interface InitialPeriodInput {
  startDate: LocalDate;
  endDate: LocalDate;
  billingCycle: BillingCycle;
  priceAmount: number;
  paymentStatus?: PaymentStatus;
}

export interface PeriodViewLike {
  periodNumber: number;
  startDate: LocalDate;
  endDate: LocalDate;
  billingCycle: BillingCycle;
  priceAmount: number;
  paymentStatus: PaymentStatus;
  renewalOutcome: RenewalOutcome;
}

/** Periodo 1 inmutable, con el precio capturado al crear (RN-04). */
export function buildInitialPeriod(input: InitialPeriodInput): PeriodViewLike {
  if (compareLocalDate(input.endDate, input.startDate) < 0) {
    throw new DomainError('validation_error', 'El fin del periodo debe ser >= el inicio', [
      { path: 'endDate', message: input.endDate },
    ]);
  }
  return {
    periodNumber: 1,
    startDate: input.startDate,
    endDate: input.endDate,
    billingCycle: input.billingCycle,
    priceAmount: input.priceAmount,
    paymentStatus: input.paymentStatus ?? 'pendiente',
    renewalOutcome: 'pendiente',
  };
}

/** El periodo nuevo no puede solaparse: debe empezar en `fin anterior + 1` o después. */
export function assertNoOverlap(previousEnd: LocalDate, nextStart: LocalDate): void {
  const earliest = nextPeriodStart(previousEnd);
  if (compareLocalDate(nextStart, earliest) < 0) {
    throw new DomainError('validation_error', 'El periodo nuevo se solapa con el anterior', [
      { path: 'startDate', message: nextStart },
    ]);
  }
}
