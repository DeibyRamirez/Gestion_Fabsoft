'use client';

import { useEffect, useState } from 'react';
import { HistoryIcon } from 'lucide-react';
import type { ClientActivityPage } from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { ActivityFeed } from '@/shared/components/activity-feed';
import { BentoCard } from '@/shared/components/bento';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadingState } from '@/shared/components/loading-state';
import { SectionHeader } from '@/shared/components/section-header';

export function ActivityPanel({ clientId, token }: { clientId: string; token: string | null }) {
  const [page, setPage] = useState<ClientActivityPage | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<ClientActivityPage>(`/clients/${clientId}/activity?pageSize=20`, { token })
      .then((result) => {
        if (alive) setPage(result);
      })
      .catch((err) => {
        if (alive) {
          setPage(null);
          setMessage(
            err instanceof ApiError ? err.message : 'No se pudo cargar la actividad del cliente.',
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [clientId, token]);

  return (
    <BentoCard>
      <SectionHeader title="Actividad" description="Últimos 20 eventos del cliente." />
      <div className="mt-4">
        {message ? (
          <p role="status" className="text-sm text-fg">
            {message}
          </p>
        ) : page === null ? (
          <LoadingState label="Cargando actividad…" />
        ) : page.data.length === 0 ? (
          <EmptyState icon={HistoryIcon} title="Sin actividad registrada." />
        ) : (
          <ActivityFeed items={page.data} />
        )}
      </div>
    </BentoCard>
  );
}
