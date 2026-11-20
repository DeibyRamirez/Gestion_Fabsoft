import { describe, expect, it } from 'vitest';
import { resolveRenewal, resolveSubscription } from './subscription.js';

describe('resolveSubscription', () => {
  it('calcula el fin y nace pendiente de activación', () => {
    const result = resolveSubscription({
      startDate: '2026-11-01',
      billingCycle: 'monthly',
      priceAmount: 100_000,
    });
    expect(result.currentPeriodEnd).toBe('2026-11-30');
    expect(result.status).toBe('pendiente_activacion');
    expect(result.customCycleMonths).toBeNull();
  });

  it('acepta un fin explícito (>= inicio) y precio 0', () => {
    const result = resolveSubscription({
      startDate: '2026-11-01',
      currentPeriodEnd: '2026-12-15',
      billingCycle: 'monthly',
      priceAmount: 0,
    });
    expect(result.currentPeriodEnd).toBe('2026-12-15');
  });

  it('rechaza un fin anterior al inicio', () => {
    expect(() =>
      resolveSubscription({
        startDate: '2026-11-10',
        currentPeriodEnd: '2026-11-09',
        billingCycle: 'monthly',
        priceAmount: 1,
      }),
    ).toThrow(/currentPeriodEnd/);
  });

  it('exige coherencia del ciclo custom', () => {
    expect(() =>
      resolveSubscription({ startDate: '2026-11-01', billingCycle: 'custom', priceAmount: 1 }),
    ).toThrow(/customCycleMonths/);
    expect(() =>
      resolveSubscription({
        startDate: '2026-11-01',
        billingCycle: 'monthly',
        customCycleMonths: 3,
        priceAmount: 1,
      }),
    ).toThrow(/customCycleMonths/);
    expect(
      resolveSubscription({
        startDate: '2026-11-01',
        billingCycle: 'custom',
        customCycleMonths: 18,
        priceAmount: 1,
      }).currentPeriodEnd,
    ).toBe('2028-04-30');
  });

  it('rechaza precio inválido', () => {
    expect(() =>
      resolveSubscription({ startDate: '2026-11-01', billingCycle: 'monthly', priceAmount: -1 }),
    ).toThrow(/priceAmount/);
    expect(() =>
      resolveSubscription({
        startDate: '2026-11-01',
        billingCycle: 'monthly',
        priceAmount: Number.NaN,
      }),
    ).toThrow(/priceAmount/);
  });

  it('rechaza fecha inválida', () => {
    expect(() =>
      resolveSubscription({ startDate: '2026-02-30', billingCycle: 'monthly', priceAmount: 1 }),
    ).toThrow(/Fecha inválida/);
  });
});

describe('resolveRenewal', () => {
  const base = {
    currentPeriodEnd: '2026-11-30',
    currentBillingCycle: 'monthly' as const,
    currentCustomCycleMonths: null,
  };

  it('por defecto empieza en fin+1 y calcula el fin del ciclo', () => {
    expect(resolveRenewal(base)).toEqual({
      startDate: '2026-12-01',
      endDate: '2026-12-31',
      billingCycle: 'monthly',
      customCycleMonths: null,
    });
  });

  it('acepta inicio y fin explícitos sin solaparse', () => {
    expect(
      resolveRenewal({ ...base, newStartDate: '2026-12-05', newEndDate: '2026-12-20' }),
    ).toEqual({
      startDate: '2026-12-05',
      endDate: '2026-12-20',
      billingCycle: 'monthly',
      customCycleMonths: null,
    });
  });

  it('rechaza un inicio que solapa el periodo anterior', () => {
    expect(() => resolveRenewal({ ...base, newStartDate: '2026-11-30' })).toThrow(/solapa/);
  });

  it('rechaza un fin anterior al inicio', () => {
    expect(() =>
      resolveRenewal({ ...base, newStartDate: '2026-12-01', newEndDate: '2026-11-30' }),
    ).toThrow(/fin del periodo/);
  });

  it('hereda los meses del ciclo custom vigente', () => {
    expect(
      resolveRenewal({
        currentPeriodEnd: '2026-11-30',
        currentBillingCycle: 'custom',
        currentCustomCycleMonths: 18,
      }).endDate,
    ).toBe('2028-05-31');
  });

  it('exige meses al cambiar a custom', () => {
    expect(() => resolveRenewal({ ...base, billingCycle: 'custom' })).toThrow(/customCycleMonths/);
  });

  it('permite cambiar la periodicidad', () => {
    expect(resolveRenewal({ ...base, billingCycle: 'annual' }).endDate).toBe('2027-11-30');
  });
});
