import Link from 'next/link';
import { cn } from '@/shared/lib/utils';
import type { NavItem } from './nav-items';

type ShellNavItemProps = {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
};

export function ShellNavItem({ item, active, onNavigate }: ShellNavItemProps) {
  const Icon = item.icon;
  const baseClass =
    'relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-[transform,background-color,color] duration-150';

  if (!item.implemented) {
    // El textContent debe seguir siendo exactamente «<label> · Próximamente».
    return (
      <span aria-disabled="true" className={cn(baseClass, 'cursor-not-allowed text-fg-muted/60')}>
        <Icon aria-hidden className="size-[18px] shrink-0" />
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
          ? 'bg-night font-semibold text-white shadow-nav-active'
          : 'text-fg-muted hover:bg-bg hover:text-fg',
      )}
      aria-current={active ? 'page' : undefined}
      {...(onNavigate ? { onClick: onNavigate } : {})}
    >
      <Icon aria-hidden className="size-[18px] shrink-0" />
      {item.label}
    </Link>
  );
}
