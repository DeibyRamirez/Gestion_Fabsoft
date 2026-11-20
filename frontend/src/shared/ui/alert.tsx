import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-xl border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:top-4 [&>svg]:left-4 [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface text-fg',
        info: 'border-status-in-renewal-fg/20 bg-status-in-renewal-bg text-status-in-renewal-fg',
        success: 'border-status-active-fg/20 bg-status-active-bg text-status-active-fg',
        warning: 'border-urgency-soon-fg/20 bg-urgency-soon-bg text-urgency-soon-fg',
        destructive: 'border-status-expired-fg/20 bg-status-expired-bg text-status-expired-fg',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export function Alert({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('leading-normal', className)} {...props} />;
}

export { alertVariants };
