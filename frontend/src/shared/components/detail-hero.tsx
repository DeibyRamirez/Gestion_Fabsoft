import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { initialsFromName } from '@/shared/components/user-avatar';

type DetailHeroProps = {
  title: string;
  accent?: string;
  initials?: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  tone?: 'nebula' | 'light';
  className?: string;
};

/** Cabecera de detalle reutilizable (cliente, suscripción, tarea, integración, portal). */
export function DetailHero({
  title,
  accent,
  initials,
  icon: Icon,
  badge,
  meta,
  actions,
  tone = 'nebula',
  className,
}: DetailHeroProps) {
  const isNebula = tone === 'nebula';
  const avatarText = initials ?? (initialsFromName(title) || '?');

  return (
    <section
      className={cn(
        'relative isolate flex flex-col gap-4 overflow-hidden p-5 shadow-card motion-safe:animate-rise sm:flex-row sm:items-center md:p-6',
        isNebula
          ? 'nebula-surface rounded-2xl border border-white/10 text-white shadow-nebula'
          : 'rounded-xl border border-border bg-surface text-fg',
        className,
      )}
    >
      {isNebula ? (
        <>
          <div
            aria-hidden
            className="absolute -inset-[20%] -z-10 opacity-50 motion-safe:animate-drift"
            style={{
              background:
                'radial-gradient(40% 40% at 70% 20%, rgb(0 200 240 / 0.22), transparent 70%)',
            }}
          />
          <div aria-hidden className="nebula-grain absolute inset-0 -z-10" />
        </>
      ) : null}

      <div
        className={cn(
          'relative grid size-14 shrink-0 place-items-center rounded-2xl text-lg font-extrabold md:size-16',
          isNebula ? 'border border-white/20 bg-white/10 text-white' : 'bg-iris-soft text-iris',
        )}
        aria-hidden
      >
        {Icon ? <Icon className="size-6" /> : avatarText}
      </div>

      <div className="relative min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {badge}
          {meta ? (
            <span className={cn('text-xs', isNebula ? 'text-white/80' : 'text-fg-muted')}>
              {meta}
            </span>
          ) : null}
        </div>
        <h1
          className={cn(
            'mt-1 text-2xl leading-tight font-extrabold tracking-tight md:text-3xl',
            isNebula ? 'text-white' : 'text-fg',
          )}
        >
          {title}
          {accent ? (
            <span
              className={cn(
                'ml-2 font-serif text-[0.85em] font-normal italic',
                isNebula ? 'text-on-nebula-cyan' : 'text-iris',
              )}
            >
              {accent}
            </span>
          ) : null}
        </h1>
      </div>

      {actions ? (
        <div className="relative flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </section>
  );
}
