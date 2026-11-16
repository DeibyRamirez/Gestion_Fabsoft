import type { BillingCycle } from '@fabsoft/shared';
import { DomainError } from '../shared/domain-error.js';
import {
  addDays,
  addMonthsClamped,
  isLastDayOfMonth,
  lastDayOfMonthOf,
  type LocalDate,
} from './local-date.js';

const MONTHS_BY_CYCLE: Record<Exclude<BillingCycle, 'custom'>, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
  biennial: 24,
};

/** Meses de un ciclo; `custom` exige `customCycleMonths` entre 1 y 120. */
export function monthsForCycle(
  cycle: BillingCycle,
  customCycleMonths: number | null = null,
): number {
  if (cycle === 'custom') {
    if (customCycleMonths === null || customCycleMonths < 1 || customCycleMonths > 120) {
      throw new DomainError('validation_error', 'customCycleMonths debe estar entre 1 y 120', [
        { path: 'customCycleMonths', message: String(customCycleMonths) },
      ]);
    }
    return customCycleMonths;
  }
  return MONTHS_BY_CYCLE[cycle];
}

/**
 * Fin inclusive del periodo (RN-03). Si el inicio es fin de mes, el fin cae en el
 * último día del mes destino (31-ene mensual ⇒ 28/29-feb); si no, es el día anterior
 * a `inicio + meses`.
 */
export function computePeriodEnd(
  start: LocalDate,
  cycle: BillingCycle,
  customCycleMonths: number | null = null,
): LocalDate {
  const target = addMonthsClamped(start, monthsForCycle(cycle, customCycleMonths));
  return isLastDayOfMonth(start) ? lastDayOfMonthOf(target) : addDays(target, -1);
}

/** El siguiente periodo empieza el día posterior al fin inclusive. */
export function nextPeriodStart(end: LocalDate): LocalDate {
  return addDays(end, 1);
}
