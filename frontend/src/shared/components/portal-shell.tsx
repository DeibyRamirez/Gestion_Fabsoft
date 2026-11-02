'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Separator } from '@/shared/ui/separator';

const PORTAL_NAV = [
  { href: '/portal', label: 'Mis suscripciones' },
  { href: '/portal/requests', label: 'Mis solicitudes' },
  { href: '/portal/contact', label: 'Contacto' },
] as const;

export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  async function signOut() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-fg">FabSoft</p>
            <p className="text-sm text-fg-muted">Portal de clientes</p>
          </div>
          {user ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-fg-muted">{user.fullName}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
                Cerrar sesión
              </Button>
            </div>
          ) : null}
        </div>
        <nav aria-label="Portal" className="mx-auto max-w-3xl px-4 pb-3">
          <ul className="flex flex-wrap gap-2">
            {PORTAL_NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'inline-flex rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-fg'
                        : 'text-fg-muted hover:bg-surface hover:text-fg',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <Separator />
      </header>
      <main id="contenido-principal" className="mx-auto max-w-3xl p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
