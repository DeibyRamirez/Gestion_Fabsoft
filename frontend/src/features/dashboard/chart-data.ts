import type { SubscriptionDto, SubscriptionStatus } from '@fabsoft/shared';
import { SUBSCRIPTION_STATUS_LABELS } from '@/shared/lib/labels';

const EXPIRING_STATUSES: SubscriptionStatus[] = ['activa', 'en_renovacion'];

const STATUS_COLORS: { status: SubscriptionStatus; color: string }[] = [
  { status: 'activa', color: 'var(--color-status-active-fg)' },
  { status: 'en_renovacion', color: 'var(--color-status-in-renewal-fg)' },
  { status: 'pendiente_activacion', color: 'var(--color-status-pending-fg)' },
  { status: 'vencida', color: 'var(--color-status-expired-fg)' },
  { status: 'no_renovada', color: 'var(--color-status-not-renewed-fg)' },
  { status: 'cancelada', color: 'var(--color-status-cancelled-fg)' },
];

export function expiringSubscriptions(subscriptions: SubscriptionDto[]): SubscriptionDto[] {
  return subscriptions.filter(
    (subscription) =>
      EXPIRING_STATUSES.includes(subscription.status) &&
      subscription.daysUntilExpiration >= 0 &&
      subscription.daysUntilExpiration <= 30,
  );
}

/** Distribución NO acumulada por rango: ≤7, 8–15 y 16–30 días. */
export function buildExpirationBuckets(subscriptions: SubscriptionDto[]) {
  const expiring = expiringSubscriptions(subscriptions);
  const count = (from: number, to: number) =>
    expiring.filter(
      (subscription) =>
        subscription.daysUntilExpiration >= from && subscription.daysUntilExpiration <= to,
    ).length;

  return [
    { label: '≤7 días', value: count(0, 7), color: '#FF8FA3' },
    { label: '8–15 días', value: count(8, 15), color: '#FFC27A' },
    { label: '16–30 días', value: count(16, 30), color: '#7FE6FB' },
  ];
}

/** Curva real de vencimientos por día para los próximos 30 días. */
export function buildExpirationSeries(subscriptions: SubscriptionDto[], days = 30) {
  const expiring = expiringSubscriptions(subscriptions);
  const values = Array.from(
    { length: days + 1 },
    (_, offset) =>
      expiring.filter((subscription) => subscription.daysUntilExpiration === offset).length,
  );
  return {
    values,
    total: values.reduce((sum, value) => sum + value, 0),
    max: Math.max(...values, 0),
  };
}

/** Composición de la cartera por estado, con conteos reales. */
export function buildStatusSegments(subscriptions: SubscriptionDto[]) {
  return STATUS_COLORS.map(({ status, color }) => ({
    label: SUBSCRIPTION_STATUS_LABELS[status],
    value: subscriptions.filter((subscription) => subscription.status === status).length,
    color,
  })).filter((segment) => segment.value > 0);
}
