import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Segmentos de migas, sin incluir el título final. */
  breadcrumbs?: string[];
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <p className="text-[11px] font-semibold tracking-wider text-fg-muted uppercase">
            {breadcrumbs.join(' / ')}
          </p>
        ) : null}
        <h1 className="mt-0.5 text-2xl leading-tight font-extrabold tracking-tight text-fg md:text-3xl">
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
