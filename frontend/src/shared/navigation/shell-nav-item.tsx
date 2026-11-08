import Link from 'next/link';
import { cn } from '@/shared/lib/utils';
import type { NavItem } from './nav-items';

type ShellNavItemProps = {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
};

export function ShellNavItem({ item, active, onNavigate }: ShellNavItemProps) {
  const baseClass =
    'relative flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors';

  if (!item.implemented) {
    return (
      <span
        aria-disabled="true"
        className={cn(baseClass, 'cursor-not-allowed text-fg-muted opacity-60')}
      >
        {item.label} · Próximamente
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        baseClass,
        active
          ? 'bg-nav-active-bg text-primary before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
          : 'text-fg-muted hover:bg-nav-active-bg/60 hover:text-fg',
      )}
      aria-current={active ? 'page' : undefined}
      {...(onNavigate ? { onClick: onNavigate } : {})}
    >
      {item.label}
    </Link>
  );
}
