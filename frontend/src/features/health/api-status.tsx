'use client';

import { useEffect, useState } from 'react';
import { API_VERSION_PREFIX, HealthResponseSchema, type HealthResponse } from '@fabsoft/shared';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? `http://localhost:4000${API_VERSION_PREFIX}`;

/** Consulta GET /api/v1/health y valida la respuesta con el esquema compartido. */
export function ApiStatus() {
  const [state, setState] = useState<HealthResponse | 'loading' | 'unreachable'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/health`, { signal: controller.signal })
      .then((r) => r.json())
      .then((body: unknown) => setState(HealthResponseSchema.parse(body)))
      .catch(() => {
        if (!controller.signal.aborted) setState('unreachable');
      });
    return () => controller.abort();
  }, []);

  const statusLabel =
    state === 'loading' ? 'Comprobando…' : state === 'unreachable' ? 'No disponible' : state.status;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Estado de la API</CardTitle>
        <CardDescription>Origen configurado: {API_BASE}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Badge
          variant={state === 'unreachable' ? 'pending' : 'active'}
          className={cn(state === 'unreachable' && 'bg-status-expired-bg text-status-expired-fg')}
        >
          {statusLabel}
        </Badge>
        {state !== 'loading' && state !== 'unreachable' ? (
          <span className="text-sm text-fg-muted tabular-nums">Versión {state.version ?? '?'}</span>
        ) : null}
      </CardContent>
    </Card>
  );
}
