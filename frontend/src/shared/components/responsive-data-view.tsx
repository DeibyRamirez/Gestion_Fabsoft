import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Presenta una tabla en escritorio y una lista de tarjetas en móvil.
 * Evita duplicar los breakpoints en cada listado.
 */
export function ResponsiveDataView({ desktop, mobile }: { desktop: ReactNode; mobile: ReactNode }) {
  return (
    <>
      <div className="hidden md:block">{desktop}</div>
      <div className="md:hidden">{mobile}</div>
    </>
  );
}

export function MobileCardList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <ul className={cn('flex flex-col gap-3', className)}>{children}</ul>;
}

export function MobileCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-card',
        className,
      )}
    >
      {children}
    </li>
  );
}
