'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { SubscriptionPage } from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { SubscriptionsTable } from './subscriptions-table';

const selectClassName =
  'flex h-10 w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

export type SubscriptionFilters = {
  status: string;
  followUpStatus: string;
  expiresFrom: string;
  expiresTo: string;
  ownerUserId: string;
};

export const EMPTY_SUBSCRIPTION_FILTERS: SubscriptionFilters = {
  status: '',
  followUpStatus: '',
  expiresFrom: '',
  expiresTo: '',
  ownerUserId: '',
};

export function SubscriptionsPage({
  initialFilters = EMPTY_SUBSCRIPTION_FILTERS,
}: {
  initialFilters?: SubscriptionFilters;
}) {
  const { token } = useAuth();
  const [page, setPage] = useState<SubscriptionPage | null>(null);
  const [filters, setFilters] = useState<SubscriptionFilters>(initialFilters);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ pageSize: '50' });
    if (filters.status) params.set('status', filters.status);
    if (filters.followUpStatus) params.set('followUpStatus', filters.followUpStatus);
    if (filters.expiresFrom) params.set('expiresFrom', filters.expiresFrom);
    if (filters.expiresTo) params.set('expiresTo', filters.expiresTo);
    if (filters.ownerUserId) params.set('ownerUserId', filters.ownerUserId);
    apiFetch<SubscriptionPage>(`/subscriptions?${params.toString()}`, { token })
      .then((result) => {
        if (!alive) return;
        setPage(result);
        setMessage(null);
      })
      .catch(() => {
        if (!alive) return;
        setPage(null);
        setMessage('No se pudieron cargar las suscripciones con estos filtros.');
      });
    return () => {
      alive = false;
    };
  }, [token, filters, version]);

  const set = <K extends keyof SubscriptionFilters>(key: K, value: SubscriptionFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <PageHeader
        breadcrumbs={['Gestión']}
        title="Suscripciones"
        description="Vigencia de las suscripciones de los clientes."
        actions={
          <Button asChild>
            <Link href="/subscriptions/new">Nueva suscripción</Link>
          </Button>
        }
      />

      {message ? (
        <div role="status" className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
          {message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-44 gap-1">
          <label className="text-xs text-fg-muted" htmlFor="subscription-status">
            Estado
          </label>
          <select
            id="subscription-status"
            value={filters.status}
            onChange={(e) => set('status', e.target.value)}
            className={selectClassName}
          >
            <option value="">Todas</option>
            <option value="active,in_renewal">Activas</option>
            <option value="active">Solo activas</option>
            <option value="in_renewal">En renovación</option>
            <option value="expired">Vencidas</option>
            <option value="cancelled">Canceladas</option>
            <option value="not_renewed">No renovadas</option>
            <option value="pending_activation">Pendientes de activación</option>
          </select>
        </div>

        <div className="grid min-w-44 gap-1">
          <label className="text-xs text-fg-muted" htmlFor="subscription-follow-up">
            Seguimiento
          </label>
          <select
            id="subscription-follow-up"
            value={filters.followUpStatus}
            onChange={(e) => set('followUpStatus', e.target.value)}
            className={selectClassName}
          >
            <option value="">Todos</option>
            <option value="none">Sin gestión</option>
            <option value="in_progress">En gestión</option>
            <option value="awaiting_client">Esperando al cliente</option>
            <option value="closed">Cerrado</option>
          </select>
        </div>

        <div className="grid gap-1">
          <label className="text-xs text-fg-muted" htmlFor="subscription-expires-from">
            Vence desde
          </label>
          <Input
            id="subscription-expires-from"
            type="date"
            value={filters.expiresFrom}
            onChange={(e) => set('expiresFrom', e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-fg-muted" htmlFor="subscription-expires-to">
            Vence hasta
          </label>
          <Input
            id="subscription-expires-to"
            type="date"
            value={filters.expiresTo}
            onChange={(e) => set('expiresTo', e.target.value)}
          />
        </div>

        <Button type="button" variant="outline" onClick={reload}>
          Actualizar
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setFilters(EMPTY_SUBSCRIPTION_FILTERS)}
        >
          Limpiar
        </Button>
      </div>

      {page ? (
        <Card>
          <CardContent className="pt-6">
            <SubscriptionsTable page={page} />
          </CardContent>
        </Card>
      ) : (
        <p aria-busy="true">Cargando suscripciones…</p>
      )}
    </div>
  );
}
