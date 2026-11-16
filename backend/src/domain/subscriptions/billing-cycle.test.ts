import { describe, expect, it } from 'vitest';
import { computePeriodEnd, monthsForCycle, nextPeriodStart } from './billing-cycle.js';

describe('billing-cycle', () => {
  it('meses por ciclo', () => {
    expect(monthsForCycle('monthly')).toBe(1);
    expect(monthsForCycle('quarterly')).toBe(3);
    expect(monthsForCycle('semiannual')).toBe(6);
    expect(monthsForCycle('annual')).toBe(12);
    expect(monthsForCycle('biennial')).toBe(24);
    expect(monthsForCycle('custom', 18)).toBe(18);
    expect(() => monthsForCycle('custom')).toThrow(/customCycleMonths/);
    expect(() => monthsForCycle('custom', 0)).toThrow(/customCycleMonths/);
    expect(() => monthsForCycle('custom', 121)).toThrow(/customCycleMonths/);
  });

  it('calcula el fin inclusive según la periodicidad', () => {
    expect(computePeriodEnd('2026-11-01', 'monthly')).toBe('2026-11-30');
    expect(computePeriodEnd('2026-11-01', 'quarterly')).toBe('2027-01-31');
    expect(computePeriodEnd('2026-11-01', 'semiannual')).toBe('2027-04-30');
    expect(computePeriodEnd('2026-11-01', 'annual')).toBe('2027-10-31');
    expect(computePeriodEnd('2026-11-01', 'biennial')).toBe('2028-10-31');
    expect(computePeriodEnd('2026-11-01', 'custom', 18)).toBe('2028-04-30');
  });

  it('T-RN03-01 — 31-ene mensual termina en feb (bisiesto incluido)', () => {
    expect(computePeriodEnd('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(computePeriodEnd('2028-01-31', 'monthly')).toBe('2028-02-29');
  });

  it('el siguiente periodo empieza en end+1', () => {
    expect(nextPeriodStart('2026-11-30')).toBe('2026-12-01');
    expect(nextPeriodStart('2028-02-29')).toBe('2028-03-01');
  });
});
