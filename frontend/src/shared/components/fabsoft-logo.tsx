import Link from 'next/link';
import { cn } from '@/shared/lib/utils';

type FabSoftLogoProps = {
  /** Enlace del logotipo; `null` desactiva el enlace. */
  href?: string | null;
  /** Variante sobre fondo oscuro (texto blanco). */
  variant?: 'default' | 'onDark';
  className?: string;
};

export function FabSoftLogo({
  href = '/dashboard',
  variant = 'default',
  className,
}: FabSoftLogoProps) {
  const content = (
    <>
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-fg"
        aria-hidden
      >
        F
      </span>
      <span
        className={cn(
          'text-base font-semibold tracking-tight',
          variant === 'onDark' ? 'text-white' : 'text-fg',
        )}
      >
        FabSoft
      </span>
    </>
  );

  const wrapperClass = cn('inline-flex items-center gap-2.5', className);

  if (href != null) {
    return (
      <Link href={href} className={cn(wrapperClass, 'rounded-md focus-visible:outline-none')}>
        {content}
      </Link>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
