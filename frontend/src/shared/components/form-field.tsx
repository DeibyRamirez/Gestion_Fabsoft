import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/ui/label';

type FormFieldProps = {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
  hint?: string;
  error?: string;
  required?: boolean;
};

export function FormField({
  label,
  htmlFor,
  children,
  className,
  hint,
  error,
  required,
}: FormFieldProps) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}
