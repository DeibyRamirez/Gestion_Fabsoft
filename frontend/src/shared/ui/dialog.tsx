'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  variant = 'center',
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  variant?: 'center' | 'sheet';
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade bg-night/50 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 bg-surface shadow-card-hover focus:outline-none',
          variant === 'center'
            ? 'top-1/2 left-1/2 w-[min(calc(100vw-2rem),30rem)] -translate-x-1/2 -translate-y-1/2 animate-pop rounded-2xl p-6'
            : 'inset-y-0 right-0 h-full w-[min(100vw,30rem)] animate-slide overflow-y-auto rounded-l-2xl border-l border-border p-6',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-4 grid size-9 place-items-center rounded-full text-fg-muted transition-[opacity,background-color] hover:bg-bg hover:text-fg">
          <XIcon className="size-4" aria-hidden />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('pr-8 text-xl font-extrabold tracking-tight text-fg', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('mt-1 text-sm text-fg-muted', className)}
      {...props}
    />
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>
  );
}
