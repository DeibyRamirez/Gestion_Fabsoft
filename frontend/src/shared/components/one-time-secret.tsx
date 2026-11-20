'use client';

import { CheckIcon, CopyIcon, KeyRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';

/** Secreto de una sola vez (API key o contraseña temporal) con copia accesible. */
export function OneTimeSecret({
  value,
  title = 'Copia este valor ahora',
  description = 'No se volverá a mostrar.',
  className,
}: {
  value: string;
  title?: string;
  description?: string;
  className?: string;
}) {
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
    <div
      className={cn(
        'rounded-xl border border-status-active-fg/25 bg-status-active-bg/60 p-4',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <KeyRoundIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-status-active-fg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-status-active-fg">{title}</p>
          <p className="text-xs text-status-active-fg/80">{description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 basis-52 overflow-x-auto rounded-md bg-surface px-3 py-2 font-mono text-xs text-fg">
          {value}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {copied ? 'Valor copiado al portapapeles.' : ''}
      </p>
    </div>
  );
}
