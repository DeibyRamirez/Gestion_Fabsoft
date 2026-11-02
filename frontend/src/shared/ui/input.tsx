import type { InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/utils';

export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-border-input bg-bg px-3 py-2 text-base text-fg shadow-sm transition-colors placeholder:text-fg-muted focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
