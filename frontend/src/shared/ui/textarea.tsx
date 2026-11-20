import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/utils';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'flex min-h-24 w-full rounded-md border border-border-input bg-surface-muted px-3.5 py-2.5 text-base text-fg transition-[border-color,box-shadow] duration-150 placeholder:text-fg-muted/80 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
