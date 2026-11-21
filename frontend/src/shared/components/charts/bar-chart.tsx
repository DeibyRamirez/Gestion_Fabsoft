'use client';

import { cn } from '@/shared/lib/utils';

export type BarDatum = {
  label: string;
  value: number;
  color?: string;
};

/** Barras verticales accesibles para distribuciones de datos reales. */
export function BarChart({
  data,
  label,
  height = 112,
  valueClassName,
  labelClassName,
  className,
}: {
  data: BarDatum[];
  label: string;
  height?: number;
  valueClassName?: string;
  labelClassName?: string;
  className?: string;
}) {
  const max = Math.max(...data.map((item) => item.value), 1);
  const summary = data.map((item) => `${item.label}: ${item.value}`).join(', ');

  return (
    <figure
      className={cn('flex flex-col', className)}
      role="img"
      aria-label={`${label}: ${summary}`}
    >
      <div className="flex items-end gap-3" style={{ height }}>
        {data.map((item) => {
          const percentage = item.value > 0 ? Math.max((item.value / max) * 100, 6) : 0;
          return (
            <div
              key={item.label}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <span
                className={cn(
                  'tabular text-[11px] leading-none font-semibold',
                  valueClassName ?? 'text-fg',
                )}
              >
                {item.value}
              </span>
              <div
                className="w-full rounded-t-lg"
                style={{
                  height: item.value > 0 ? `${percentage}%` : '2px',
                  backgroundColor: item.color ?? 'var(--color-iris)',
                  opacity: item.value > 0 ? 1 : 0.25,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3">
        {data.map((item) => (
          <span
            key={item.label}
            className={cn(
              'flex-1 text-center text-[10.5px] leading-tight',
              labelClassName ?? 'text-fg-muted',
            )}
          >
            {item.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
