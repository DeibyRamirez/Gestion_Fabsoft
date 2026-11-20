'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RepeatIcon } from 'lucide-react';
import type { PortalMe, PortalSubscription } from '@fabsoft/shared';
import { useAuth } from '@/features/auth/auth-provider';
import { BentoCard } from '@/shared/components/bento';
import { DetailHero } from '@/shared/components/detail-hero';
import { EmptyState } from '@/shared/components/empty-state';
import { FilterBar, FilterField } from '@/shared/components/filter-bar';
import { LoadingState } from '@/shared/components/loading-state';
import { formatCop, formatDate } from '@/shared/lib/format';
import { BILLING_CYCLE_LABELS } from '@/shared/lib/labels';
import { Button } from '@/shared/ui/button';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { StatusBadge, UrgencyBadge } from '@/shared/ui/status-badge';
import { portalApi } from './api';

export function PortalPage() {
  const { token, user } = useAuth();
  const [me, setMe] = useState<PortalMe | null>(null);
  const [subscriptions, setSubscriptions] = useState<PortalSubscription[]>([]);
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([portalApi.me(token), portalApi.subscriptions(token, status)])
      .then(([profile, page]) => {
        if (!alive) return;
        setMe(profile);
        setSubscriptions(page.data);
        setMessage(null);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) {
          setMessage('No se pudo cargar el portal.');
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [token, status, version]);

  const firstName = me?.user.fullName.split(/\s+/)[0] ?? user?.fullName.split(/\s+/)[0] ?? '';

  return (
    <div className="flex flex-col gap-4">
      <DetailHero
        title={`Hola${firstName ? `, ${firstName}` : ''}`}
        accent="tus suscripciones."
        icon={RepeatIcon}
        meta={me ? me.organization.legalName : 'Portal de clientes'}
        actions={
          <Button
            type="button"
            variant="outline"
            className="border-white/25 bg-white/10 text-white hover:bg-white/20"
            onClick={() => setVersion((v) => v + 1)}
          >
            Actualizar
          </Button>
        }
      />

      {message ? (
        <p role="status" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}

      <FilterBar>
        <FilterField label="Estado" htmlFor="portal-status">
          <select
            id="portal-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={nativeSelectClassName}
          >
            <option value="">Todas</option>
            <option value="activa,en_renovacion">Activas y en renovación</option>
            <option value="vencida">Vencidas</option>
            <option value="pendiente_activacion">Pendientes de activación</option>
            <option value="no_renovada">No renovadas</option>
            <option value="cancelada">Canceladas</option>
          </select>
        </FilterField>
      </FilterBar>

      {!loaded ? (
        <LoadingState label="Cargando suscripciones…" />
      ) : subscriptions.length === 0 ? (
        <EmptyState
          icon={RepeatIcon}
          title="No hay suscripciones para mostrar con este filtro."
          description="Prueba con otro estado o consulta más tarde."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {subscriptions.map((subscription) => (
            <BentoCard key={subscription.id} as="article">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold tracking-tight text-fg">
                    {subscription.productName}
                  </h2>
                  <p className="text-xs text-fg-muted">
                    {BILLING_CYCLE_LABELS[subscription.billingCycle]} ·{' '}
                    {formatDate(subscription.currentPeriodEnd)}
                  </p>
                </div>
                <StatusBadge kind="subscription" value={subscription.status} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <UrgencyBadge days={subscription.daysUntilExpiration} />
                <span className="tabular font-mono text-xs text-fg">
                  {formatCop(subscription.priceAmount)} {subscription.currency}
                </span>
              </div>
              {subscription.hasOpenRenewalRequest ? (
                <p role="status" className="mt-3 text-xs text-fg-muted">
                  Tienes una solicitud de renovación abierta para esta suscripción.
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/portal/subscriptions/${subscription.id}`}>Ver detalle</Link>
                </Button>
                {!subscription.hasOpenRenewalRequest &&
                subscription.status !== 'cancelada' &&
                subscription.status !== 'no_renovada' ? (
                  <Button asChild size="sm">
                    <Link href={`/portal/subscriptions/${subscription.id}#solicitar`}>
                      Solicitar renovación
                    </Link>
                  </Button>
                ) : null}
              </div>
            </BentoCard>
          ))}
        </div>
      )}
    </div>
  );
}
