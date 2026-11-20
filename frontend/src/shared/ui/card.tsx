import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/utils';

const cardVariants = cva('text-fg', {
  variants: {
    variant: {
      default: 'rounded-xl border border-border bg-surface shadow-card',
      flat: 'rounded-xl border border-border bg-surface',
      nebula:
        'nebula-surface relative isolate overflow-hidden rounded-2xl border border-white/10 text-white shadow-nebula',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type CardProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>;

export function Card({ className, variant, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col gap-1.5 p-5 pb-3 md:p-6 md:pb-4', className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-lg leading-tight font-bold tracking-tight text-fg', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-fg-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0 md:p-6 md:pt-0', className)} {...props} />;
}

export { cardVariants };
