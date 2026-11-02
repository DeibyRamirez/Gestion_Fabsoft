'use client';

import { useEffect, useState } from 'react';
import { API_VERSION_PREFIX, HealthResponseSchema, type HealthResponse } from '@fabsoft/shared';

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

  if (state === 'loading') return <p>API: comprobando…</p>;
  if (state === 'unreachable') return <p>API: no disponible ({API_BASE})</p>;
  return (
    <p>
      API: {state.status} (v{state.version ?? '?'})
    </p>
  );
}
