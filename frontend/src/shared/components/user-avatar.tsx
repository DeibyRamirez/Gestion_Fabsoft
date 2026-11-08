import { cn } from '@/shared/lib/utils';

/** Iniciales a partir del nombre completo (máx. 2 caracteres). */
export function initialsFromName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

type UserAvatarProps = {
  fullName: string;
  size?: 'sm' | 'md';
  className?: string;
};

export function UserAvatar({ fullName, size = 'md', className }: UserAvatarProps) {
  const initials = initialsFromName(fullName);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary',
        size === 'sm' ? 'size-8 text-xs' : 'size-9 text-sm',
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}
