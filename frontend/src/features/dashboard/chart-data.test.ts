import { describe, expect, it } from 'vitest';
import type { SubscriptionDto } from '@fabsoft/shared';
import { buildExpirationBuckets, buildExpirationSeries, buildStatusSegments } from './chart-data';

function subscription(overrides: Partial<SubscriptionDto>): SubscriptionDto {
  return {
    id: crypto.randomUUID(),
    client: { id: crypto.randomUUID(), legalName: 'Cliente' },
    product: { id: crypto.randomUUID(), name: 'Producto' },
    contractReference: null,
    startDate: '2026-01-01',
    currentPeriodEnd: '2026-12-01',
    daysUntilExpiration: 10,
    billingCycle: 'annual',
    customCycleMonths: null,
    priceAmount: '100000.00',
    currency: 'COP',
    status: 'activa',
    followUpStatus: 'sin_gestion',
    currentPaymentStatus: null,
    isRenewable: true,
    owner: null,
    version: 1,
    ...overrides,
  };
}

describe('dashboard chart data', () => {
  const subscriptions = [
    subscription({ status: 'activa', daysUntilExpiration: 3 }),
    subscription({ status: 'en_renovacion', daysUntilExpiration: 7 }),
    subscription({ status: 'activa', daysUntilExpiration: 8 }),
    subscription({ status: 'en_renovacion', daysUntilExpiration: 15 }),
    subscription({ status: 'activa', daysUntilExpiration: 16 }),
    subscription({ status: 'activa', daysUntilExpiration: 30 }),
    subscription({ status: 'vencida', daysUntilExpiration: 5 }),
    subscription({ status: 'activa', daysUntilExpiration: 31 }),
    subscription({ status: 'activa', daysUntilExpiration: -2 }),
  ];

  it('agrupa vencimientos reales en rangos no acumulados', () => {
    expect(buildExpirationBuckets(subscriptions).map((bucket) => bucket.value)).toEqual([2, 2, 2]);
  });

  it('construye la serie diaria de 31 puntos', () => {
    const series = buildExpirationSeries(subscriptions);
    expect(series.values).toHaveLength(31);
    expect(series.total).toBe(6);
    expect(series.values[3]).toBe(1);
    expect(series.values[7]).toBe(1);
    expect(series.values[8]).toBe(1);
    expect(series.values[15]).toBe(1);
    expect(series.values[16]).toBe(1);
    expect(series.values[30]).toBe(1);
    expect(series.max).toBe(1);
  });

  it('compone la cartera por estado y omite estados vacíos', () => {
    const segments = buildStatusSegments(subscriptions);
    expect(segments.find((segment) => segment.label === 'Activa')?.value).toBe(6);
    expect(segments.find((segment) => segment.label === 'En renovación')?.value).toBe(2);
    expect(segments.find((segment) => segment.label === 'Vencida')?.value).toBe(1);
    expect(segments.some((segment) => segment.label === 'Cancelada')).toBe(false);
  });
});
