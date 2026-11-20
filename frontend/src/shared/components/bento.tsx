import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/** Tarjeta base del bento (radio 22px, sombra en 3 capas). */
export function BentoCard({
  className,
  children,
  as: Tag = 'section',
}: {
  className?: string;
  children: ReactNode;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <Tag
      className={cn(
        'rounded-xl border border-border bg-surface p-5 shadow-card motion-safe:animate-rise md:p-6',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * Tarjeta «nebulosa» para lo urgente (vencimientos).
 * El glow cian se mantiene ≤ .35 para conservar blanco ≥ 7:1.
 */
export function UrgentCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        'nebula-surface relative isolate overflow-hidden rounded-2xl p-6 text-white shadow-nebula motion-safe:animate-rise',
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute -inset-[20%] -z-10 opacity-60 motion-safe:animate-drift"
        style={{
          background: 'radial-gradient(40% 40% at 70% 20%, rgb(0 200 240 / 0.25), transparent 70%)',
        }}
      />
      <div aria-hidden className="nebula-grain absolute inset-0 -z-10" />
      {children}
    </section>
  );
}

/** Cifra + enlace dentro de una UrgentCard. Siempre es un Link al listado filtrado. */
export function NebulaStat({
  href,
  value,
  label,
  tone = 'white',
  size = 'md',
}: {
  href: string;
  value: number;
  label: string;
  tone?: 'white' | 'rose' | 'amber' | 'cyan';
  size?: 'md' | 'xl';
}) {
  const color = {
    white: 'text-white',
    rose: 'text-on-nebula-rose',
    amber: 'text-on-nebula-amber',
    cyan: 'text-on-nebula-cyan',
  }[tone];
  return (
    <Link href={href} className="group rounded-lg focus-visible:outline-white">
      <span
        className={cn(
          'tabular block leading-[.85] font-extrabold tracking-tighter',
          size === 'xl' ? 'text-7xl lg:text-8xl' : 'text-4xl',
          color,
        )}
      >
        {value}
      </span>
      <span className="mt-2 block text-sm text-white/85 group-hover:underline">{label}</span>
    </Link>
  );
}
