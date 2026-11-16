'use client';

import { usePathname, useRouter } from 'next/navigation';
import { MenuIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { FabSoftLogo } from '@/shared/components/fabsoft-logo';
import { UserAvatar } from '@/shared/components/user-avatar';
import { PORTAL_NAV } from '@/shared/navigation/nav-items';
import { ShellNavItem } from '@/shared/navigation/shell-nav-item';
import { Button } from '@/shared/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/shared/ui/sheet';

function PortalNav({
  pathname,
  onNavigate,
  className,
}: {
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <ul className={className}>
      {PORTAL_NAV.map((item) => (
        <li key={item.href}>
          <ShellNavItem
            item={item}
            active={pathname === item.href}
            {...(onNavigate ? { onNavigate } : {})}
          />
        </li>
      ))}
    </ul>
  );
}

export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <FabSoftLogo href="/portal" />
          <p className="hidden text-sm text-fg-muted sm:block">Portal de clientes</p>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <UserAvatar fullName={user.fullName} size="sm" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex"
                  onClick={() => void signOut()}
                >
                  Cerrar sesión
                </Button>
              </>
            ) : null}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Abrir menú del portal"
                >
                  <MenuIcon aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[min(100vw,18rem)] bg-surface p-4">
                <SheetTitle className="text-base font-semibold">Menú</SheetTitle>
                <nav aria-label="Portal" className="mt-4">
                  <PortalNav
                    pathname={pathname}
                    onNavigate={() => setMenuOpen(false)}
                    className="flex flex-col gap-0.5"
                  />
                </nav>
                {user ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-6 w-full"
                    onClick={() => void signOut()}
                  >
                    Cerrar sesión
                  </Button>
                ) : null}
              </SheetContent>
            </Sheet>
          </div>
        </div>
        <nav
          aria-label="Portal"
          className="mx-auto hidden max-w-3xl border-t border-border px-4 py-2 sm:block"
        >
          <PortalNav pathname={pathname} className="flex flex-wrap gap-1" />
        </nav>
      </header>
      <main id="contenido-principal" className="mx-auto max-w-3xl p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
