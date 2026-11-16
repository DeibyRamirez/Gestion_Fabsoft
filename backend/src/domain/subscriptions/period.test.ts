import { describe, expect, it } from 'vitest';
import { assertNoOverlap, buildInitialPeriod } from './period.js';

describe('period', () => {
  it('construye el periodo 1 inmutable', () => {
    expect(
      buildInitialPeriod({
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        billingCycle: 'monthly',
        priceAmount: 100,
      }),
    ).toEqual({
      periodNumber: 1,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      billingCycle: 'monthly',
      priceAmount: 100,
      paymentStatus: 'pending',
      renewalOutcome: 'pending',
    });
  });

  it('respeta el estado de pago inicial', () => {
    expect(
      buildInitialPeriod({
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        billingCycle: 'monthly',
        priceAmount: 100,
        paymentStatus: 'received',
      }).paymentStatus,
    ).toBe('received');
  });

  it('rechaza un periodo invertido', () => {
    expect(() =>
      buildInitialPeriod({
        startDate: '2026-11-02',
        endDate: '2026-11-01',
        billingCycle: 'monthly',
        priceAmount: 1,
      }),
    ).toThrow(/fin del periodo/);
  });

  it('no permite solapes con el periodo anterior', () => {
    expect(() => assertNoOverlap('2026-11-30', '2026-12-01')).not.toThrow();
    expect(() => assertNoOverlap('2026-11-30', '2026-12-02')).not.toThrow();
    expect(() => assertNoOverlap('2026-11-30', '2026-11-30')).toThrow(/solapa/);
  });
});
