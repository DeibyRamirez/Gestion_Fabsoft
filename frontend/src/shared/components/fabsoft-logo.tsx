import Link from 'next/link';
import { cn } from '@/shared/lib/utils';

type FabSoftLogoProps = {
  /** Enlace del logotipo; `null` desactiva el enlace. */
  href?: string | null;
  /** Variante sobre fondo oscuro (texto blanco). */
  variant?: 'default' | 'onDark';
  /** Oculta el texto y deja solo el monograma. */
  compact?: boolean;
  className?: string;
};

export function FabSoftLogo({
  href = '/dashboard',
  variant = 'default',
  compact = false,
  className,
}: FabSoftLogoProps) {
  const content = (
    <>
      <span
        className="nebula-surface flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-extrabold text-white shadow-sm"
        aria-hidden
      >
        F
      </span>
      {compact ? null : (
        <span
          className={cn(
            'text-base font-extrabold tracking-tight',
            variant === 'onDark' ? 'text-white' : 'text-fg',
          )}
        >
          FabSoft
        </span>
      )}
    </>
  );

  const wrapperClass = cn('inline-flex items-center gap-2.5', className);

  if (href != null) {
    return (
      <Link
        href={href}
        aria-label="FabSoft"
        className={cn(
          wrapperClass,
          'rounded-xl focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        )}
      >
        {content}
      </Link>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
