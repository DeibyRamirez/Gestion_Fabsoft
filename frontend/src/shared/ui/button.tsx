import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-fg hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
        destructive:
          'bg-danger text-danger-fg hover:bg-danger/90 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
        outline:
          'border border-border-input bg-bg hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
        ghost:
          'hover:bg-surface focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 min-h-6 px-4 py-2',
        sm: 'h-9 min-h-6 rounded-md px-3',
        lg: 'h-11 min-h-6 rounded-md px-6',
        icon: 'size-10 min-h-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
