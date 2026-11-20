'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { RepeatIcon } from 'lucide-react';
import type { SubscriptionPage } from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { EmptyState } from '@/shared/components/empty-state';
import { FilterBar, FilterField, SearchInput } from '@/shared/components/filter-bar';
import { LoadingState } from '@/shared/components/loading-state';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { SubscriptionsTable } from './subscriptions-table';

export type SubscriptionFilters = {
  q: string;
  status: string;
  followUpStatus: string;
  expiresFrom: string;
  expiresTo: string;
  ownerUserId: string;
};

export const EMPTY_SUBSCRIPTION_FILTERS: SubscriptionFilters = {
  q: '',
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
    if (filters.q.trim()) params.set('q', filters.q.trim());
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
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title="Suscripciones"
        description="Vigencia de las suscripciones de los clientes."
        actions={
          <Button asChild>
            <Link href="/subscriptions/new">Nueva suscripción</Link>
          </Button>
        }
      />

      {message ? (
        <div
          role="status"
          className="rounded-xl bg-status-expired-bg px-4 py-3 text-sm text-status-expired-fg"
        >
          {message}
        </div>
      ) : null}

      <FilterBar
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFilters(EMPTY_SUBSCRIPTION_FILTERS)}
            >
              Limpiar
            </Button>
            <Button type="button" variant="outline" onClick={reload}>
              Actualizar
            </Button>
          </>
        }
      >
        <FilterField label="Buscar" htmlFor="subscription-search" className="sm:col-span-2">
          <SearchInput
            id="subscription-search"
            placeholder="Cliente, producto o NIT"
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
            aria-label="Buscar suscripciones"
          />
        </FilterField>
        <FilterField label="Estado" htmlFor="subscription-status">
          <select
            id="subscription-status"
            value={filters.status}
            onChange={(e) => set('status', e.target.value)}
            className={nativeSelectClassName}
          >
            <option value="">Todas</option>
            <option value="activa,en_renovacion">Activas</option>
            <option value="activa">Solo activas</option>
            <option value="en_renovacion">En renovación</option>
            <option value="vencida">Vencidas</option>
            <option value="cancelada">Canceladas</option>
            <option value="no_renovada">No renovadas</option>
            <option value="pendiente_activacion">Pendientes de activación</option>
          </select>
        </FilterField>
        <FilterField label="Seguimiento" htmlFor="subscription-follow-up">
          <select
            id="subscription-follow-up"
            value={filters.followUpStatus}
            onChange={(e) => set('followUpStatus', e.target.value)}
            className={nativeSelectClassName}
          >
            <option value="">Todos</option>
            <option value="sin_gestion">Sin gestión</option>
            <option value="en_gestion">En gestión</option>
            <option value="esperando_cliente">Esperando al cliente</option>
            <option value="cerrado">Cerrado</option>
          </select>
        </FilterField>
        <FilterField label="Vence desde" htmlFor="subscription-expires-from">
          <Input
            id="subscription-expires-from"
            type="date"
            value={filters.expiresFrom}
            onChange={(e) => set('expiresFrom', e.target.value)}
          />
        </FilterField>
        <FilterField label="Vence hasta" htmlFor="subscription-expires-to">
          <Input
            id="subscription-expires-to"
            type="date"
            value={filters.expiresTo}
            onChange={(e) => set('expiresTo', e.target.value)}
          />
        </FilterField>
      </FilterBar>

      {page ? (
        page.data.length === 0 ? (
          <EmptyState
            icon={RepeatIcon}
            title="No hay suscripciones con estos filtros."
            description="Ajusta la búsqueda o crea una nueva suscripción."
            action={
              <Button asChild size="sm">
                <Link href="/subscriptions/new">Nueva suscripción</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="pt-5">
              <SubscriptionsTable page={page} />
            </CardContent>
          </Card>
        )
      ) : (
        <LoadingState label="Cargando suscripciones…" />
      )}
    </div>
  );
}
