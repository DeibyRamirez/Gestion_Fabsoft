'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';

type PasswordInputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Texto del botón para distinguir varios campos en la misma pantalla. */
  toggleLabel?: string;
};

/** Input de contraseña con botón accesible para mostrar/ocultar el valor. */
export function PasswordInput({
  className,
  toggleLabel = 'contraseña',
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-12', className)} />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? `Ocultar ${toggleLabel}` : `Mostrar ${toggleLabel}`}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-fg-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}
