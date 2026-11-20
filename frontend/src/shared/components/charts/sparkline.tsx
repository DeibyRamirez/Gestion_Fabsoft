'use client';

import { useId } from 'react';
import { cn } from '@/shared/lib/utils';

function buildLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1]!;
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, '');
}

/** Línea/área compacta para distribuciones reales (no series históricas inventadas). */
export function Sparkline({
  values,
  label,
  height = 112,
  color = 'var(--color-iris)',
  fill = 'var(--color-iris)',
  className,
}: {
  values: number[];
  label: string;
  height?: number;
  color?: string;
  fill?: string;
  className?: string;
}) {
  const gradientId = `sparkline-${useId().replace(/:/g, '')}`;
  const width = 320;
  const safeValues = values.length > 0 ? values : [0];
  const max = Math.max(...safeValues, 1);
  const step = safeValues.length > 1 ? width / (safeValues.length - 1) : width;
  const points = safeValues.map((value, index) => ({
    x: index * step,
    y: height - 6 - (value / max) * (height - 12),
  }));
  const line = buildLinePath(points);
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('block w-full', className)}
      style={{ height }}
    >
      <title>{label}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.28" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
