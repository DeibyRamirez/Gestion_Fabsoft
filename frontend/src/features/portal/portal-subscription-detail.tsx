'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftIcon, RepeatIcon } from 'lucide-react';
import type { PortalPeriod, PortalRenewalRequest, PortalSubscription } from '@fabsoft/shared';
import { ApiError } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { BentoCard } from '@/shared/components/bento';
import { DetailHero } from '@/shared/components/detail-hero';
import { DetailList } from '@/shared/components/detail-list';
import { FormField } from '@/shared/components/form-field';
import { LoadingState } from '@/shared/components/loading-state';
import {
  MobileCard,
  MobileCardList,
  ResponsiveDataView,
} from '@/shared/components/responsive-data-view';
import { SectionHeader } from '@/shared/components/section-header';
import { formatCop, formatDate, formatDateTime } from '@/shared/lib/format';
import {
  BILLING_CYCLE_LABELS,
  RENEWAL_OUTCOME_LABELS,
  RENEWAL_REQUEST_RESOLUTION_LABELS,
} from '@/shared/lib/labels';
import { Button } from '@/shared/ui/button';
import { StatusBadge, ToneBadge, UrgencyBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { Textarea } from '@/shared/ui/textarea';
import { portalApi } from './api';

const isOpen = (status: PortalRenewalRequest['status']): boolean =>
  status === 'pendiente_revision' || status === 'en_progreso';

export function PortalSubscriptionDetail({ subscriptionId }: { subscriptionId: string }) {
  const { token } = useAuth();
  const [subscription, setSubscription] = useState<PortalSubscription | null>(null);
  const [periods, setPeriods] = useState<PortalPeriod[]>([]);
  const [requests, setRequests] = useState<PortalRenewalRequest[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      portalApi.subscription(token, subscriptionId),
      portalApi.periods(token, subscriptionId),
      portalApi.renewalRequests(token, subscriptionId),
    ])
      .then(([detail, history, requestPage]) => {
        if (!alive) return;
        setSubscription(detail);
        setPeriods(history.data);
        setRequests(requestPage.data);
        setMessage(null);
      })
      .catch(() => {
        if (alive) setMessage('Suscripción no encontrada.');
      });
    return () => {
      alive = false;
    };
  }, [token, subscriptionId, version]);

  async function requestRenewal() {
    setBusy(true);
    try {
      await portalApi.createRenewalRequest(token, {
        subscriptionId,
        comment: comment.trim() ? comment.trim() : null,
      });
      setComment('');
      setMessage('Solicitud enviada. El equipo de FabSoft la revisará y te contactará.');
      reload();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo enviar la solicitud.');
    } finally {
      setBusy(false);
    }
  }

  if (!subscription) {
    return message ? (
      <p role="alert" className="text-sm text-danger">
        {message}
      </p>
    ) : (
      <LoadingState label="Cargando suscripción…" />
    );
  }

  const hasOpenRequest = requests.some((request) => isOpen(request.status));
  const requestable =
    !hasOpenRequest && !['cancelada', 'no_renovada'].includes(subscription.status);

  const periodDesktop = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>Inicio</TableHead>
          <TableHead>Fin</TableHead>
          <TableHead>Ciclo</TableHead>
          <TableHead>Resultado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {periods.map((period) => (
          <TableRow key={period.periodNumber}>
            <TableCell className="tabular font-mono text-xs">{period.periodNumber}</TableCell>
            <TableCell>{formatDate(period.startDate)}</TableCell>
            <TableCell>{formatDate(period.endDate)}</TableCell>
            <TableCell>{BILLING_CYCLE_LABELS[period.billingCycle]}</TableCell>
            <TableCell>{RENEWAL_OUTCOME_LABELS[period.renewalOutcome]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const periodMobile = (
    <MobileCardList>
      {periods.map((period) => (
        <MobileCard key={period.periodNumber}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-fg">Periodo #{period.periodNumber}</span>
            <span className="text-xs text-fg-muted">
              {RENEWAL_OUTCOME_LABELS[period.renewalOutcome]}
            </span>
          </div>
          <p className="text-xs text-fg-muted">
            {formatDate(period.startDate)} → {formatDate(period.endDate)}
          </p>
          <p className="text-xs text-fg-muted">{BILLING_CYCLE_LABELS[period.billingCycle]}</p>
        </MobileCard>
      ))}
    </MobileCardList>
  );

  return (
    <div className="flex flex-col gap-4">
      <DetailHero
        title={subscription.productName}
        icon={RepeatIcon}
        badge={<StatusBadge kind="subscription" value={subscription.status} />}
        meta={
          <>
            Vence {formatDate(subscription.currentPeriodEnd)}
            <UrgencyBadge days={subscription.daysUntilExpiration} className="ml-2" />
          </>
        }
        actions={
          <Button
            asChild
            variant="outline"
            className="border-white/25 bg-white/10 text-white hover:bg-white/20"
          >
            <Link href="/portal">
              <ArrowLeftIcon aria-hidden />
              Volver al portal
            </Link>
          </Button>
        }
      />

      {message ? (
        <p role="status" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}

      <BentoCard>
        <SectionHeader title="Resumen" />
        <DetailList
          className="mt-4"
          columns={2}
          items={[
            { label: 'Inicio', value: formatDate(subscription.startDate) },
            { label: 'Vence', value: formatDate(subscription.currentPeriodEnd) },
            { label: 'Periodicidad', value: BILLING_CYCLE_LABELS[subscription.billingCycle] },
            {
              label: 'Precio',
              value: `${formatCop(subscription.priceAmount)} ${subscription.currency}`,
            },
            { label: 'Referencia de contrato', value: subscription.contractReference ?? '—' },
            {
              label: 'Estado',
              value: <StatusBadge kind="subscription" value={subscription.status} />,
            },
            {
              label: 'Condiciones de renovación',
              value: subscription.renewalTerms ?? '—',
              className: 'sm:col-span-2',
            },
          ]}
        />
      </BentoCard>

      <BentoCard>
        <SectionHeader title="Historial de periodos" />
        <div className="mt-4">
          {periods.length === 0 ? (
            <p className="text-sm text-fg-muted">Sin periodos registrados.</p>
          ) : (
            <ResponsiveDataView desktop={periodDesktop} mobile={periodMobile} />
          )}
        </div>
      </BentoCard>

      <BentoCard>
        <div id="solicitar">
          <SectionHeader
            title="Solicitar renovación"
            description="El equipo de FabSoft revisará tu solicitud y te contactará."
          />
          <div className="mt-4 grid gap-4">
            {hasOpenRequest ? (
              <p role="status" className="text-sm text-fg-muted">
                Ya tienes una solicitud de renovación abierta para esta suscripción.
              </p>
            ) : null}
            {!requestable ? (
              <p className="text-sm text-fg-muted">
                Esta suscripción no admite una nueva solicitud.
              </p>
            ) : (
              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void requestRenewal();
                }}
              >
                <FormField label="Comentario (opcional)" htmlFor="renewal-comment">
                  <Textarea
                    id="renewal-comment"
                    name="comment"
                    maxLength={2000}
                    rows={4}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </FormField>
                <div className="flex justify-end">
                  <Button type="submit" disabled={busy}>
                    {busy ? 'Enviando…' : 'Enviar solicitud'}
                  </Button>
                </div>
              </form>
            )}

            {requests.length > 0 ? (
              <div className="grid gap-2 border-t border-border pt-4">
                <h3 className="text-sm font-semibold text-fg">Solicitudes de esta suscripción</h3>
                <ul className="grid gap-2 text-sm">
                  {requests.map((request) => (
                    <li key={request.id} className="flex flex-wrap items-center gap-2">
                      <StatusBadge kind="renewalRequest" value={request.status} />
                      <span className="text-fg-muted">{formatDateTime(request.createdAt)}</span>
                      {request.resolution ? (
                        <ToneBadge tone="neutral">
                          {RENEWAL_REQUEST_RESOLUTION_LABELS[request.resolution]}
                        </ToneBadge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-sm text-fg-muted">
              También puedes consultar todas tus solicitudes en{' '}
              <Link className="text-link underline" href="/portal/requests">
                Mis solicitudes
              </Link>
              .
            </p>
          </div>
        </div>
      </BentoCard>
    </div>
  );
}
