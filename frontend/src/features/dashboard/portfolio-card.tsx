import Link from 'next/link';
import { RepeatIcon } from 'lucide-react';
import type { DashboardIndicator } from '@fabsoft/shared';
import { ChartLegend } from '@/shared/components/charts/chart-legend';
import { DonutChart, type DonutSegment } from '@/shared/components/charts/donut-chart';
import { cn } from '@/shared/lib/utils';
import { indicatorHref } from './kpi-card';

/** KPI de suscripciones activas con composición real de la cartera. */
export function PortfolioCard({
  indicator,
  activeCount,
  segments,
  total,
  loading = false,
  error = null,
  className,
}: {
  indicator: DashboardIndicator;
  activeCount: number;
  segments: DonutSegment[];
  total: number;
  loading?: boolean;
  error?: string | null;
  className?: string;
}) {
  return (
    <Link
      href={indicatorHref(indicator)}
      className={cn(
        'group flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-card transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card-hover motion-safe:animate-rise',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-status-active-bg/70 text-status-active-fg">
            <RepeatIcon aria-hidden className="size-4" />
          </span>
          <span className="text-[12.5px] leading-tight font-medium text-fg-muted">
            Suscripciones activas
          </span>
          <span className="tabular text-4xl leading-none font-extrabold tracking-tight text-fg">
            {activeCount}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1">
          {loading ? (
            <div className="size-[110px] animate-pulse rounded-full bg-bg" aria-hidden />
          ) : error ? (
            <div className="grid size-[110px] place-items-center rounded-full border border-dashed border-border px-2 text-center text-[10px] text-fg-muted">
              Sin datos de cartera
            </div>
          ) : segments.length === 0 ? (
            <div className="grid size-[110px] place-items-center rounded-full border border-dashed border-border px-2 text-center text-[10px] text-fg-muted">
              Sin suscripciones
            </div>
          ) : (
            <DonutChart
              segments={segments}
              label={`Cartera por estado. Total ${total} suscripciones.`}
              centerValue={total}
              centerLabel="cartera"
              size={110}
              thickness={14}
            />
          )}
        </div>
      </div>

      {!loading && !error && segments.length > 0 ? (
        <ChartLegend
          items={segments}
          className="grid grid-cols-1 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-2"
        />
      ) : null}

      <span className="text-xs font-semibold text-link group-hover:underline">
        Ver lista <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
