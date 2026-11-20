'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BellIcon, LogOutIcon, MenuIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { FabSoftLogo } from '@/shared/components/fabsoft-logo';
import { UserAvatar } from '@/shared/components/user-avatar';
import { USER_ROLE_LABELS } from '@/shared/lib/labels';
import { cn } from '@/shared/lib/utils';
import { Breadcrumbs } from '@/shared/navigation/breadcrumbs';
import {
  INTERNAL_ADMIN_NAV,
  INTERNAL_MAIN_NAV,
  MOBILE_TAB_HREFS,
} from '@/shared/navigation/nav-items';
import { ShellNavItem } from '@/shared/navigation/shell-nav-item';
import { Button } from '@/shared/ui/button';
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
      <p className="px-3.5 py-2 text-[11px] font-semibold tracking-wider text-fg-muted uppercase">
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
          <p className="px-3.5 pt-5 pb-2 text-[11px] font-semibold tracking-wider text-fg-muted uppercase">
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

function UserFooter({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="m-3 flex items-center gap-3 rounded-2xl bg-bg p-3">
      <UserAvatar fullName={user.fullName} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{user.fullName}</p>
        <p className="truncate text-xs text-fg-muted">{USER_ROLE_LABELS[user.role]}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onSignOut}
        aria-label="Cerrar sesión"
      >
        <LogOutIcon aria-hidden />
      </Button>
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
  const tabs = INTERNAL_MAIN_NAV.filter((item) =>
    (MOBILE_TAB_HREFS as readonly string[]).includes(item.href),
  );

  return (
    <div className="flex min-h-screen flex-col bg-bg lg:flex-row">
      <aside className="sticky top-3 m-3 mr-0 hidden h-[calc(100vh-1.5rem)] w-64 shrink-0 flex-col rounded-xl border border-border bg-surface shadow-card lg:flex">
        <div className="flex h-[72px] items-center px-5">
          <FabSoftLogo href="/dashboard" />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto">
          <NavLinks pathname={pathname} isAdmin={!!isAdmin} />
        </div>
        <UserFooter onSignOut={handleSignOut} />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-bg/85 px-4 backdrop-blur-md lg:h-[72px] lg:px-8">
          <div className="lg:hidden">
            <FabSoftLogo href="/dashboard" />
          </div>
          <div className="hidden min-w-0 flex-1 lg:block">
            <Breadcrumbs />
          </div>
          {user ? (
            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/notifications"
                aria-label="Alertas"
                className="grid size-11 place-items-center rounded-full border border-border bg-surface text-fg-muted shadow-sm transition-[color,transform] hover:text-fg active:scale-[.98]"
              >
                <BellIcon aria-hidden className="size-[18px]" />
              </Link>
              <UserAvatar fullName={user.fullName} size="sm" />
            </div>
          ) : null}
        </header>
        <main id="contenido-principal" className="flex-1 px-4 pt-2 pb-28 md:px-6 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      <nav
        aria-label="Accesos rápidos"
        className="fixed inset-x-3 bottom-3 z-40 grid h-16 grid-cols-5 rounded-[22px] bg-night text-white/70 shadow-nebula lg:hidden"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-1 text-[10.5px] font-semibold',
                active && 'text-white',
              )}
            >
              <span className={cn('rounded-full px-3 py-1', active && 'bg-iris text-white')}>
                <Icon aria-hidden className="size-[18px]" />
              </span>
              {item.shortLabel ?? item.label}
            </Link>
          );
        })}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-1 text-[10.5px] font-semibold"
              aria-label="Abrir menú"
            >
              <span className="px-3 py-1">
                <MenuIcon aria-hidden className="size-[18px]" />
              </span>
              Más
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(100vw,18rem)] bg-surface p-0">
            <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
            <div className="flex h-16 items-center px-4">
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
      </nav>
    </div>
  );
}
