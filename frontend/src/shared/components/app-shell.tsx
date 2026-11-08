'use client';

import { usePathname, useRouter } from 'next/navigation';
import { MenuIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { FabSoftLogo } from '@/shared/components/fabsoft-logo';
import { UserAvatar } from '@/shared/components/user-avatar';
import { INTERNAL_ADMIN_NAV, INTERNAL_MAIN_NAV } from '@/shared/navigation/nav-items';
import { ShellNavItem } from '@/shared/navigation/shell-nav-item';
import { Button } from '@/shared/ui/button';
import { Separator } from '@/shared/ui/separator';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/shared/ui/sheet';

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  pathname,
  isAdmin,
  onNavigate,
}: {
  pathname: string;
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5 px-3 py-2">
      <p className="px-3 py-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
        Gestión
      </p>
      {INTERNAL_MAIN_NAV.map((item) => (
        <ShellNavItem
          key={item.href}
          item={item}
          active={isNavActive(pathname, item.href)}
          {...(onNavigate ? { onNavigate } : {})}
        />
      ))}
      {isAdmin ? (
        <>
          <Separator className="my-3" />
          <p className="px-3 py-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            Admin
          </p>
          {INTERNAL_ADMIN_NAV.map((item) => (
            <ShellNavItem
              key={item.href}
              item={item}
              active={isNavActive(pathname, item.href)}
              {...(onNavigate ? { onNavigate } : {})}
            />
          ))}
        </>
      ) : null}
    </nav>
  );
}

function UserFooter({ onSignOut, compact }: { onSignOut: () => void; compact?: boolean }) {
  const { user } = useAuth();
  if (!user) return null;

  const roleLabel =
    user.role === 'admin' ? 'Administrador' : user.role === 'operator' ? 'Operador' : user.role;

  return (
    <div className="border-t border-border p-4">
      <div className="flex items-center gap-3">
        <UserAvatar fullName={user.fullName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{user.fullName}</p>
          <p className="truncate text-xs text-fg-muted">Rol: {roleLabel}</p>
        </div>
      </div>
      {!compact ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={onSignOut}
        >
          Cerrar sesión
        </Button>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAdmin = user?.role === 'admin';

  async function signOut() {
    await logout();
    router.replace('/login');
  }

  const handleSignOut = () => void signOut();

  return (
    <div className="flex min-h-screen flex-col bg-bg lg:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface shadow-sm lg:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <FabSoftLogo href="/dashboard" />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto">
          <NavLinks pathname={pathname} isAdmin={!!isAdmin} />
        </div>
        <UserFooter onSignOut={handleSignOut} />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur-sm lg:px-6">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="lg:hidden"
                aria-label="Abrir menú"
              >
                <MenuIcon aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[min(100vw,18rem)] flex-col bg-surface p-0">
              <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
              <div className="flex h-14 items-center border-b border-border px-4">
                <FabSoftLogo href="/dashboard" />
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavLinks
                  pathname={pathname}
                  isAdmin={!!isAdmin}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              </div>
              <UserFooter onSignOut={handleSignOut} />
            </SheetContent>
          </Sheet>
          <div className="lg:hidden">
            <FabSoftLogo href="/dashboard" />
          </div>
          {user ? (
            <div className="ml-auto flex items-center gap-2">
              <span className="sr-only">{user.fullName}</span>
              <UserAvatar fullName={user.fullName} size="sm" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={handleSignOut}
              >
                Cerrar sesión
              </Button>
            </div>
          ) : null}
        </header>
        <main id="contenido-principal" className="flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
