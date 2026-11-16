import { DomainError } from '../shared/domain-error.js';

/** Fecha de negocio `YYYY-MM-DD` (America/Bogota), sin hora. */
export type LocalDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const toIso = (year: number, month: number, day: number): LocalDate =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parse(date: LocalDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

export function isLocalDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const { year, month, day } = parse(value);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= lastDayOfMonth(year, month);
}

export function assertLocalDate(value: string): LocalDate {
  if (!isLocalDate(value)) {
    throw new DomainError('validation_error', 'Fecha inválida', [{ path: 'date', message: value }]);
  }
  return value;
}

/** Comparación lexicográfica válida para ISO `YYYY-MM-DD`. */
export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parse(date);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Suma meses ajustando el día al último del mes destino (31-ene + 1 mes ⇒ 28/29-feb). */
export function addMonthsClamped(date: LocalDate, months: number): LocalDate {
  const { year, month, day } = parse(date);
  const zeroBased = month - 1 + months;
  const targetYear = year + Math.floor(zeroBased / 12);
  const targetMonth = (((zeroBased % 12) + 12) % 12) + 1;
  const targetDay = Math.min(day, lastDayOfMonth(targetYear, targetMonth));
  return toIso(targetYear, targetMonth, targetDay);
}

export function isLastDayOfMonth(date: LocalDate): boolean {
  const { year, month, day } = parse(date);
  return day === lastDayOfMonth(year, month);
}

export function lastDayOfMonthOf(date: LocalDate): LocalDate {
  const { year, month } = parse(date);
  return toIso(year, month, lastDayOfMonth(year, month));
}
