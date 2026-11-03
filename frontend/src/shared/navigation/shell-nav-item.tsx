import Link from 'next/link';
import { cn } from '@/shared/lib/utils';
import type { NavItem } from './nav-items';

type ShellNavItemProps = {
  item: NavItem;
  className: string;
  onNavigate?: () => void;
};

export function ShellNavItem({ item, className, onNavigate }: ShellNavItemProps) {
  if (!item.implemented) {
    return (
      <span aria-disabled="true" className={cn(className, 'cursor-not-allowed opacity-60')}>
        {item.label} · Próximamente
      </span>
    );
  }

  return (
    <Link href={item.href} className={className} {...(onNavigate ? { onClick: onNavigate } : {})}>
      {item.label}
    </Link>
  );
}
