import Link from 'next/link';
import type { DashboardIndicator } from '@fabsoft/shared';

export function indicatorHref(indicator: DashboardIndicator): string {
  const resource =
    indicator.resource === 'renewal-tasks'
      ? '/tasks'
      : indicator.resource === 'renewal-requests'
        ? '/renewal-requests'
        : '/subscriptions';
  const query = new URLSearchParams(indicator.filter).toString();
  return query ? `${resource}?${query}` : resource;
}

export function KpiCard({
  label,
  indicator,
  hint,
}: {
  label: string;
  indicator: DashboardIndicator;
  hint?: string;
}) {
  return (
    <Link
      href={indicatorHref(indicator)}
      className="group flex min-h-28 flex-col justify-between rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-primary hover:bg-nav-active-bg/40 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
    >
      <span className="text-sm font-medium text-fg-muted">{label}</span>
      <span className="text-3xl font-semibold tabular-nums text-fg">{indicator.count}</span>
      <span className="text-xs text-link group-hover:underline">
        {hint ?? 'Ver lista'} <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
