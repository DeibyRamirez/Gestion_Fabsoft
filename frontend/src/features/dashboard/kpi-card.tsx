import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { DashboardIndicator } from '@fabsoft/shared';
import { cn } from '@/shared/lib/utils';
import { toneIconClass, type Tone } from '@/shared/ui/status-badge';

/** SIN CAMBIOS de lógica: mismo mapeo recurso → ruta y mismos query params del API. */
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
  icon: Icon,
  tone = 'neutral',
  size = 'default',
  className,
}: {
  label: string;
  indicator: DashboardIndicator;
  /** Solo textos fijos («Ver lista»). NO inventar métricas que el API no entrega. */
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  size?: 'default' | 'large';
  className?: string;
}) {
  return (
    <Link
      href={indicatorHref(indicator)}
      className={cn(
        'group flex min-h-28 flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-card transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card-hover motion-safe:animate-rise',
        className,
      )}
    >
      {Icon ? (
        <span className={cn('grid size-8 place-items-center rounded-lg', toneIconClass(tone))}>
          <Icon aria-hidden className="size-4" />
        </span>
      ) : null}
      <span className="text-[12.5px] leading-tight font-medium text-fg-muted">{label}</span>
      <span
        className={cn(
          'tabular mt-auto leading-none font-extrabold tracking-tight text-fg',
          size === 'large' ? 'text-4xl' : 'text-3xl',
        )}
      >
        {indicator.count}
      </span>
      <span className="text-xs font-semibold text-link group-hover:underline">
        {hint ?? 'Ver lista'} <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
