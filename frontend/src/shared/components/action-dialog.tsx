'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { Textarea } from '@/shared/ui/textarea';

/** Reemplazo accesible de window.confirm. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type PromptField = {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'textarea' | 'number' | 'select';
  defaultValue?: string;
  options?: Array<{ value: string; label: string }>;
  /** Devuelve un mensaje de error o null. Replica la validación de la vista / schema Zod. */
  validate?: (value: string) => string | null;
  inputMode?: 'decimal' | 'text' | 'numeric';
  min?: number;
  max?: number;
  step?: string;
  autoFocus?: boolean;
};

/**
 * Reemplazo de window.prompt (uno o varios campos). Devuelve los valores ya
 * recortados; la vista construye el MISMO payload que antes.
 */
export function PromptDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  submitLabel = 'Guardar',
  destructive = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: PromptField[];
  submitLabel?: string;
  destructive?: boolean;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const baseId = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const values: Record<string, string> = {};
    const nextErrors: Record<string, string> = {};
    for (const f of fields) {
      const v = String(data.get(f.name) ?? '').trim();
      values[f.name] = v;
      const err = f.validate ? f.validate(v) : v ? null : 'Campo obligatorio';
      if (err) nextErrors[f.name] = err;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onOpenChange(false);
    onSubmit(values);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setErrors({});
        onOpenChange(o);
      }}
    >
      <DialogContent variant="sheet">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className={description ? undefined : 'sr-only'}>
          {description ?? title}
        </DialogDescription>
        <form onSubmit={handleSubmit} noValidate className="mt-5 flex flex-col gap-4">
          {fields.map((f) => {
            const id = `${baseId}-${f.name}`;
            const err = errors[f.name];
            const common = {
              id,
              name: f.name,
              defaultValue: f.defaultValue ?? '',
              'aria-invalid': err ? true : undefined,
              'aria-describedby': err ? `${id}-error` : undefined,
              autoFocus: f.autoFocus,
            };
            return (
              <div key={f.name} className="flex flex-col gap-1.5">
                <Label htmlFor={id}>{f.label}</Label>
                {f.type === 'textarea' ? (
                  <Textarea {...common} rows={3} />
                ) : f.type === 'select' ? (
                  <select {...common} className={nativeSelectClassName}>
                    {(f.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    {...common}
                    type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                    inputMode={f.inputMode ?? (f.type === 'number' ? 'decimal' : 'text')}
                    {...(f.min !== undefined ? { min: f.min } : {})}
                    {...(f.max !== undefined ? { max: f.max } : {})}
                    {...(f.step !== undefined ? { step: f.step } : {})}
                  />
                )}
                {err ? (
                  <p id={`${id}-error`} className="text-sm font-medium text-danger">
                    {err}
                  </p>
                ) : null}
              </div>
            );
          })}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Volver
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Validadores que replican los mínimos actuales de los schemas Zod del contrato. */
export const minChars =
  (n: number, label = 'El motivo') =>
  (v: string): string | null =>
    v.length >= n ? null : `${label} debe tener al menos ${n} caracteres.`;
