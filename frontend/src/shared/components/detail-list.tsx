import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

export type DetailItem = {
  label: string;
  value: ReactNode;
  className?: string;
};

const COLUMNS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};

export function DetailList({
  items,
  columns = 2,
  className,
}: {
  items: DetailItem[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl className={cn('grid gap-4', COLUMNS[columns], className)}>
      {items.map((item) => (
        <div key={item.label} className={cn('min-w-0', item.className)}>
          <dt className="text-xs font-semibold text-fg-muted">{item.label}</dt>
          <dd className="mt-1 text-sm font-medium break-words text-fg">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
