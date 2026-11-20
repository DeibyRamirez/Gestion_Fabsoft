'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import { ROUTE_LABELS } from './nav-items';

function buildCrumbs(pathname: string): { label: string; href: string }[] {
  const segments = pathname.split('/').filter(Boolean);
  const isPortal = segments[0] === 'portal';
  const root = isPortal ? '/portal' : '/dashboard';
  const crumbs: { label: string; href: string }[] = [
    {
      label: isPortal ? 'Portal' : 'Gestión',
      href: root,
    },
  ];

  let current = '';
  segments.forEach((segment, index) => {
    current += `/${segment}`;
    if (isPortal && index === 0) return;
    const label = ROUTE_LABELS[segment] ?? (index === segments.length - 1 ? 'Detalle' : segment);
    crumbs.push({ label, href: current });
  });

  return crumbs;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  return (
    <nav aria-label="Migas de pan" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm text-fg-muted">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.href}>
              {index > 0 ? (
                <li aria-hidden className="text-fg-muted/50">
                  /
                </li>
              ) : null}
              <li className="min-w-0">
                {last ? (
                  <span aria-current="page" className="block truncate font-semibold text-fg">
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href} className="block truncate hover:text-fg">
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
