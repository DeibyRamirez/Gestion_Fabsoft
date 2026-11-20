import type { InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/utils';

export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-11 w-full min-w-0 rounded-md border border-border-input bg-surface-muted px-3.5 py-2 text-base text-fg transition-[border-color,box-shadow] duration-150 placeholder:text-fg-muted/80 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
