'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MenuIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { cn } from '@/shared/lib/utils';
import { INTERNAL_ADMIN_NAV, INTERNAL_MAIN_NAV } from '@/shared/navigation/nav-items';
import { ShellNavItem } from '@/shared/navigation/shell-nav-item';
import { Button } from '@/shared/ui/button';
import { Separator } from '@/shared/ui/separator';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/shared/ui/sheet';

function NavLinks({
  pathname,
  isAdmin,
  onNavigate,
}: {
  pathname: string;
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  function linkClass(href: string) {
    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
    return cn(
      'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
      active ? 'bg-bg text-fg shadow-sm' : 'text-fg-muted hover:bg-bg/70 hover:text-fg',
    );
  }

  return (
    <nav aria-label="Principal" className="flex flex-col gap-1 p-3">
      {INTERNAL_MAIN_NAV.map((item) => (
        <ShellNavItem
          key={item.href}
          item={item}
          className={linkClass(item.href)}
          {...(onNavigate ? { onNavigate } : {})}
        />
      ))}
      {isAdmin ? (
        <>
          <Separator className="my-2" />
          <p className="px-3 py-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            Admin
          </p>
          {INTERNAL_ADMIN_NAV.map((item) => (
            <ShellNavItem
              key={item.href}
              item={item}
              className={linkClass(item.href)}
              {...(onNavigate ? { onNavigate } : {})}
            />
          ))}
        </>
      ) : null}
    </nav>
  );
}

function SidebarBrand() {
  return (
    <div className="flex h-14 items-center border-b border-border px-4">
      <Link href="/dashboard" className="text-base font-semibold tracking-tight text-fg">
        FabSoft
      </Link>
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

  const userBar = user ? (
    <div className="flex items-center gap-3 border-t border-border p-4 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-fg">{user.fullName}</p>
        <p className="truncate text-fg-muted capitalize">{user.role}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
        Cerrar sesión
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex min-h-screen flex-col bg-bg lg:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <SidebarBrand />
        <div className="flex flex-1 flex-col overflow-y-auto">
          <NavLinks pathname={pathname} isAdmin={!!isAdmin} />
        </div>
        {userBar}
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-bg px-4 lg:px-6">
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
            <SheetContent side="left" className="flex flex-col p-0">
              <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
              <SidebarBrand />
              <div className="flex-1 overflow-y-auto">
                <NavLinks
                  pathname={pathname}
                  isAdmin={!!isAdmin}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              </div>
              {userBar}
            </SheetContent>
          </Sheet>
          <p className="text-sm font-medium text-fg lg:hidden">FabSoft</p>
          {user ? (
            <div className="ml-auto hidden items-center gap-3 text-sm lg:flex">
              <span className="text-fg-muted">
                {user.fullName} ({user.role})
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => void signOut()}>
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
