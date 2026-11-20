import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

export function FormGrid({
  children,
  className,
  columns = 2,
}: {
  children: ReactNode;
  className?: string;
  columns?: 1 | 2 | 3;
}) {
  const cols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  }[columns];
  return <div className={cn('grid gap-4', cols, className)}>{children}</div>;
}

export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-3', className)}>{children}</div>
  );
}
