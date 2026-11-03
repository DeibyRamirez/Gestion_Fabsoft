import Link from 'next/link';

/** Enlace visible sólo al recibir foco por teclado (WCAG skip link). */
export function SkipLink() {
  return (
    <Link
      href="#contenido-principal"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:bg-bg focus:px-4 focus:py-2 focus:text-fg focus:shadow-sm focus:ring-2 focus:ring-focus"
    >
      Saltar al contenido
    </Link>
  );
}
