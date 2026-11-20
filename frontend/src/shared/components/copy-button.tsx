'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { Button, type ButtonProps } from '@/shared/ui/button';

type CopyButtonProps = {
  value: string;
  label?: string;
  className?: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  'aria-label'?: string;
};

/** Copia un identificador técnico al portapapeles con feedback accesible. */
export function CopyButton({
  value,
  label = 'Copiar',
  className,
  size = 'sm',
  variant = 'outline',
  'aria-label': ariaLabel,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        aria-label={ariaLabel ?? label}
        title={ariaLabel ?? label}
        onClick={() => void copy()}
      >
        {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
        {label ? <span>{copied ? 'Copiado' : label}</span> : null}
      </Button>
      <span role="status" className="sr-only">
        {copied ? 'Valor copiado al portapapeles.' : ''}
      </span>
    </>
  );
}
