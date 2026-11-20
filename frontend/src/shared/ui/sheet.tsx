import * as SheetPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/shared/lib/utils';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetPortal = SheetPrimitive.Portal;

export function SheetOverlay({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn('fixed inset-0 z-50 animate-fade bg-night/50 backdrop-blur-[2px]', className)}
      {...props}
    />
  );
}

export function SheetContent({
  className,
  children,
  side = 'left',
  ...props
}: ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        className={cn(
          'fixed z-50 flex animate-fade flex-col gap-4 bg-surface shadow-card-hover',
          side === 'left' && 'inset-y-0 left-0 h-full w-72 border-r border-border rounded-r-2xl',
          side === 'right' && 'inset-y-0 right-0 h-full w-80 border-l border-border rounded-l-2xl',
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute top-4 right-4 grid size-9 place-items-center rounded-full text-fg-muted transition-[opacity,background-color] hover:bg-bg hover:text-fg">
          <XIcon className="size-4" aria-hidden />
          <span className="sr-only">Cerrar menú</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

export function SheetHeader({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-4', className)} {...props} />;
}

export function SheetTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn('text-lg font-bold tracking-tight text-fg', className)}
      {...props}
    />
  );
}
