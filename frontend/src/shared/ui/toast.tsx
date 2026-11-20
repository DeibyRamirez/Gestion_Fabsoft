'use client';

import { CircleAlertIcon, CircleCheckIcon, InfoIcon, XIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

type ToastTone = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; tone: ToastTone };

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

let nextId = 1;

/** Toasts accesibles (role=status / aria-live). Sin dependencias nuevas. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId++;
      setItems((list) => [...list.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-md animate-rise items-start gap-3 rounded-2xl border-l-4 bg-surface px-4 py-3 text-sm text-fg shadow-card-hover',
              t.tone === 'success' && 'border-status-active-fg',
              t.tone === 'error' && 'border-danger',
              t.tone === 'info' && 'border-iris',
            )}
          >
            {t.tone === 'error' ? (
              <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
            ) : t.tone === 'info' ? (
              <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-iris" />
            ) : (
              <CircleCheckIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-status-active-fg"
              />
            )}
            <p className="flex-1">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded-full text-fg-muted transition-opacity hover:opacity-70"
            >
              <XIcon aria-hidden className="size-4" />
              <span className="sr-only">Cerrar aviso</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Si no hay provider (p. ej. en tests unitarios) es un no-op. */
export function useToast(): (message: string, tone?: ToastTone) => void {
  return useContext(ToastContext) ?? noop;
}

function noop(): void {}
