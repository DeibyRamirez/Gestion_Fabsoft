'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOutIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { FabSoftLogo } from '@/shared/components/fabsoft-logo';
import { UserAvatar } from '@/shared/components/user-avatar';
import { cn } from '@/shared/lib/utils';
import { PORTAL_NAV } from '@/shared/navigation/nav-items';
import { Button } from '@/shared/ui/button';

function isPortalActive(pathname: string, href: string): boolean {
  if (href === '/portal') return pathname === '/portal';
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
      <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4">
          <FabSoftLogo href="/portal" />
          <p className="hidden text-xs font-medium text-fg-muted sm:block">Portal de clientes</p>
          {user ? (
            <div className="ml-auto flex items-center gap-2">
              <UserAvatar fullName={user.fullName} size="sm" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar sesión"
                onClick={() => void signOut()}
              >
                <LogOutIcon aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
        <nav aria-label="Portal" className="mx-auto hidden max-w-4xl gap-1 px-4 pb-2 sm:flex">
          {PORTAL_NAV.map((item) => {
            const Icon = item.icon;
            const active = isPortalActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-[background-color,color]',
                  active
                    ? 'bg-night text-white shadow-nav-active'
                    : 'text-fg-muted hover:bg-bg hover:text-fg',
                )}
              >
                <Icon aria-hidden className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main id="contenido-principal" className="mx-auto max-w-4xl px-4 py-6 pb-28 sm:px-6 sm:pb-10">
        {children}
      </main>

      <nav
        aria-label="Accesos del portal"
        className="fixed inset-x-3 bottom-3 z-40 grid h-16 grid-cols-3 rounded-[22px] bg-night text-white/70 shadow-nebula sm:hidden"
      >
        {PORTAL_NAV.map((item) => {
          const Icon = item.icon;
          const active = isPortalActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-1 text-[10.5px] font-semibold',
                active && 'text-white',
              )}
            >
              <span className={cn('rounded-full px-3 py-1', active && 'bg-iris text-white')}>
                <Icon aria-hidden className="size-[18px]" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
