import { SearchIcon } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';

export function FilterBar({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('rounded-xl border border-border bg-surface p-4 shadow-card md:p-5', className)}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
        {actions ? (
          <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
        ) : null}
      </div>
    </section>
  );
}

export function FilterField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label className="text-xs font-semibold text-fg-muted" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-muted"
      />
      <Input className="pl-10" {...props} />
    </div>
  );
}
