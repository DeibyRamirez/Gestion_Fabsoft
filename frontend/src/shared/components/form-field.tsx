import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/ui/label';

type FormFieldProps = {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
  hint?: string;
};

export function FormField({ label, htmlFor, children, className, hint }: FormFieldProps) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-sm text-fg-muted">{hint}</p> : null}
    </div>
  );
}
