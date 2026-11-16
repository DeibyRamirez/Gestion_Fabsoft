import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  assertLocalDate,
  compareLocalDate,
  isLastDayOfMonth,
  isLocalDate,
  lastDayOfMonth,
  lastDayOfMonthOf,
} from './local-date.js';

describe('local-date', () => {
  it('valida ISO y días reales', () => {
    expect(isLocalDate('2026-11-14')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2027-02-29')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('2026-00-10')).toBe(false);
    expect(isLocalDate('2026-11-31')).toBe(false);
    expect(isLocalDate('14-11-2026')).toBe(false);
    expect(isLocalDate('2026-11-14T00:00:00Z')).toBe(false);
    expect(() => assertLocalDate('2026-02-30')).toThrow(/Fecha inválida/);
    expect(assertLocalDate('2026-02-28')).toBe('2026-02-28');
  });

  it('compara y suma días', () => {
    expect(compareLocalDate('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareLocalDate('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareLocalDate('2026-01-01', '2026-01-01')).toBe(0);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('suma meses con clamp y fin de mes', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-11-15', 2)).toBe('2027-01-15');
    expect(addMonthsClamped('2026-11-15', 14)).toBe('2028-01-15');
    expect(lastDayOfMonth(2028, 2)).toBe(29);
    expect(lastDayOfMonth(2027, 2)).toBe(28);
    expect(isLastDayOfMonth('2028-02-29')).toBe(true);
    expect(isLastDayOfMonth('2028-02-28')).toBe(false);
    expect(lastDayOfMonthOf('2026-11-14')).toBe('2026-11-30');
  });
});
