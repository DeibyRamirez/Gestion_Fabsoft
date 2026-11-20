'use client';

import { cn } from '@/shared/lib/utils';

export type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

/** Dona SVG accesible. El centro puede mostrar el total. */
export function DonutChart({
  segments,
  label,
  size = 128,
  thickness = 16,
  centerValue,
  centerLabel,
  className,
}: {
  segments: DonutSegment[];
  label: string;
  size?: number;
  thickness?: number;
  centerValue?: string | number;
  centerLabel?: string;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const summary = segments.map((segment) => `${segment.label}: ${segment.value}`).join(', ');
  const arcs = segments.map((segment, index) => {
    const length = total > 0 ? (segment.value / total) * circumference : 0;
    const offset =
      total > 0
        ? segments
            .slice(0, index)
            .reduce((sum, previous) => sum + (previous.value / total) * circumference, 0)
        : 0;
    const gap = Math.min(2, length / 3);
    return {
      segment,
      dash: Math.max(length - gap, 0),
      offset,
    };
  });

  return (
    <div
      role="img"
      aria-label={`${label}: ${summary}`}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90">
        <title>{`${label}: ${summary}`}</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={thickness}
        />
        {arcs
          .filter(({ segment }) => segment.value > 0)
          .map(({ segment, dash, offset }) => (
            <circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${Math.max(circumference - dash, 0)}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {centerValue !== undefined ? (
          <span className="tabular text-2xl leading-none font-extrabold tracking-tight text-fg">
            {centerValue}
          </span>
        ) : null}
        {centerLabel ? (
          <span className="mt-1 text-[10px] font-semibold tracking-wider text-fg-muted uppercase">
            {centerLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
