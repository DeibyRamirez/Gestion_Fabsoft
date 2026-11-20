'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeftIcon,
  BanIcon,
  CalendarClockIcon,
  PlayIcon,
  RefreshCwIcon,
  XCircleIcon,
} from 'lucide-react';
import type { PaymentStatus, SubscriptionDetailDto, SubscriptionPeriodDto } from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PromptDialog, minChars } from '@/shared/components/action-dialog';
import { BentoCard } from '@/shared/components/bento';
import { DetailHero } from '@/shared/components/detail-hero';
import { DetailList } from '@/shared/components/detail-list';
import { LoadingState } from '@/shared/components/loading-state';
import {
  MobileCard,
  MobileCardList,
  ResponsiveDataView,
} from '@/shared/components/responsive-data-view';
import { SectionHeader } from '@/shared/components/section-header';
import { formatCop, formatDate } from '@/shared/lib/format';
import {
  BILLING_CYCLE_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from '@/shared/lib/labels';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { StatusBadge, UrgencyBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { useToast } from '@/shared/ui/toast';

const TERMINAL = ['cancelada', 'no_renovada'];
const RENEWABLE = ['activa', 'en_renovacion', 'vencida'];
const PAYMENT_STATUSES: PaymentStatus[] = ['sin_seguimiento', 'pendiente', 'recibido'];

type DialogKind = 'notRenewed' | 'correctExpiration' | 'renew' | 'cancel' | null;

export function SubscriptionDetailView({ subscriptionId }: { subscriptionId: string }) {
  const { token, user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionDetailDto | null>(null);
  const [periods, setPeriods] = useState<SubscriptionPeriodDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch<SubscriptionDetailDto>(`/subscriptions/${subscriptionId}`, { token }),
      apiFetch<{ data: SubscriptionPeriodDto[] }>(`/subscriptions/${subscriptionId}/periods`, {
        token,
      }),
    ])
      .then(([detail, history]) => {
        if (!alive) return;
        setSubscription(detail);
        setPeriods(history.data);
      })
      .catch(() => {
        if (alive) setMessage('Suscripción no encontrada.');
      });
    return () => {
      alive = false;
    };
  }, [subscriptionId, token, version]);

  async function run(
    path: string,
    payload: unknown,
    okMessage: string,
    method: 'POST' | 'PATCH' = 'POST',
  ) {
    try {
      await apiFetch(path, { method, token, body: JSON.stringify(payload) });
      setMessage(okMessage);
      toast(okMessage);
      reload();
    } catch (err) {
      const errorMessage =
        err instanceof ApiError && err.problem?.code === 'version_conflict'
          ? 'La suscripción cambió; recarga e intenta de nuevo.'
          : err instanceof ApiError
            ? err.message
            : 'No se pudo completar la acción.';
      setMessage(errorMessage);
      toast(errorMessage, 'error');
    }
  }

  function activate() {
    if (subscription) {
      void run(
        `/subscriptions/${subscription.id}/activate`,
        { version: subscription.version },
        'Suscripción activada.',
      );
    }
  }

  function startRenewal() {
    if (!subscription) return;
    void run(
      `/subscriptions/${subscription.id}/start-renewal`,
      { version: subscription.version },
      'Renovación iniciada.',
    );
  }

  function markNotRenewed(reason: string) {
    if (!subscription) return;
    void run(
      `/subscriptions/${subscription.id}/not-renewed`,
      { version: subscription.version, reason },
      'No renovación registrada.',
    );
  }

  function correctExpiration(date: string, reason: string) {
    if (!subscription) return;
    void run(
      `/subscriptions/${subscription.id}/correct-expiration`,
      { version: subscription.version, newCurrentPeriodEnd: date, reason },
      'Vencimiento corregido.',
    );
  }

  function updatePayment(periodId: string, paymentStatus: PaymentStatus) {
    if (!subscription) return;
    void run(
      `/subscriptions/${subscription.id}/periods/${periodId}`,
      { paymentStatus },
      'Pago del periodo actualizado.',
      'PATCH',
    );
  }

  function renew(priceAmount: number) {
    if (!subscription) return;
    void run(
      `/subscriptions/${subscription.id}/renew`,
      { version: subscription.version, newPeriod: { priceAmount: priceAmount.toFixed(2) } },
      'Suscripción renovada.',
    );
  }

  function cancel(reason: string) {
    if (!subscription) return;
    void run(
      `/subscriptions/${subscription.id}/cancel`,
      { version: subscription.version, reason },
      'Suscripción cancelada.',
    );
  }

  if (!subscription) {
    return message ? (
      <Alert variant="destructive">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    ) : (
      <LoadingState label="Cargando suscripción…" />
    );
  }

  const periodDesktop = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>Periodo</TableHead>
          <TableHead className="text-right">Precio</TableHead>
          <TableHead>Pago</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {periods.map((period) => (
          <TableRow key={period.id}>
            <TableCell className="tabular font-mono text-xs">{period.periodNumber}</TableCell>
            <TableCell className="whitespace-nowrap">
              {formatDate(period.startDate)} → {formatDate(period.endDate)}
            </TableCell>
            <TableCell className="text-right">
              <span className="tabular font-mono text-xs">{formatCop(period.priceAmount)}</span>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <StatusBadge kind="payment" value={period.paymentStatus} />
                <label className="sr-only" htmlFor={`payment-${period.id}`}>
                  Pago del periodo {period.periodNumber}
                </label>
                <select
                  id={`payment-${period.id}`}
                  value={period.paymentStatus}
                  className={`${nativeSelectClassName} h-9 min-w-32 text-xs`}
                  onChange={(e) => updatePayment(period.id, e.target.value as PaymentStatus)}
                >
                  {PAYMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {PAYMENT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const periodMobile = (
    <MobileCardList>
      {periods.map((period) => (
        <MobileCard key={period.id}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-fg">Periodo #{period.periodNumber}</span>
            <StatusBadge kind="payment" value={period.paymentStatus} />
          </div>
          <p className="text-xs text-fg-muted">
            {formatDate(period.startDate)} → {formatDate(period.endDate)}
          </p>
          <p className="tabular font-mono text-xs text-fg">{formatCop(period.priceAmount)}</p>
          <label className="sr-only" htmlFor={`payment-mobile-${period.id}`}>
            Pago del periodo {period.periodNumber}
          </label>
          <select
            id={`payment-mobile-${period.id}`}
            value={period.paymentStatus}
            className={`${nativeSelectClassName} min-w-40`}
            onChange={(e) => updatePayment(period.id, e.target.value as PaymentStatus)}
          >
            {PAYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PAYMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </MobileCard>
      ))}
    </MobileCardList>
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <DetailHero
        title={subscription.client.legalName}
        meta={
          <>
            <span className="font-semibold text-white">{subscription.product.name}</span>
            <span aria-hidden> · </span>
            <span className="font-mono">Vence {formatDate(subscription.currentPeriodEnd)}</span>
            <UrgencyBadge days={subscription.daysUntilExpiration} className="ml-2" />
          </>
        }
        badge={<StatusBadge kind="subscription" value={subscription.status} />}
        icon={RefreshCwIcon}
        actions={
          <Button
            asChild
            variant="outline"
            className="border-white/25 bg-white/10 text-white hover:bg-white/20"
          >
            <Link href="/subscriptions">
              <ArrowLeftIcon aria-hidden />
              Volver al listado
            </Link>
          </Button>
        }
      />

      <p role="status" className="sr-only">
        {message}
      </p>

      <div className="grid gap-4 lg:grid-cols-12">
        <BentoCard className="lg:col-span-5">
          <SectionHeader
            title="Vigencia"
            action={
              <span className="text-xs text-fg-muted">
                {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
              </span>
            }
          />
          <DetailList
            className="mt-4"
            columns={2}
            items={[
              { label: 'Inicio', value: formatDate(subscription.startDate) },
              { label: 'Vence', value: formatDate(subscription.currentPeriodEnd) },
              {
                label: 'Periodicidad',
                value: BILLING_CYCLE_LABELS[subscription.billingCycle],
              },
              {
                label: 'Precio',
                value: (
                  <span className="tabular font-mono">
                    {formatCop(subscription.priceAmount)} COP
                  </span>
                ),
              },
              {
                label: 'Pago del periodo',
                value: subscription.currentPeriod ? (
                  <StatusBadge kind="payment" value={subscription.currentPeriod.paymentStatus} />
                ) : (
                  '—'
                ),
              },
              {
                label: 'Seguimiento',
                value: <StatusBadge kind="followUp" value={subscription.followUpStatus} />,
              },
              {
                label: 'Días restantes',
                value: <UrgencyBadge days={subscription.daysUntilExpiration} />,
              },
              {
                label: 'Contrato',
                value: subscription.contractReference ?? '—',
              },
            ]}
          />
          <p className="mt-4 text-xs text-fg-muted">
            Seguimiento actual: {FOLLOW_UP_STATUS_LABELS[subscription.followUpStatus]}.
          </p>
        </BentoCard>

        <BentoCard className="lg:col-span-7">
          <SectionHeader
            title="Historial de periodos"
            description={`${periods.length} periodo(s) registrados.`}
          />
          <div className="mt-4">
            {periods.length === 0 ? (
              <p className="text-sm text-fg-muted">Sin periodos registrados.</p>
            ) : (
              <ResponsiveDataView desktop={periodDesktop} mobile={periodMobile} />
            )}
          </div>
        </BentoCard>

        <BentoCard className="lg:col-span-12">
          <SectionHeader
            title="Acciones"
            description="Disponibles según el estado de la suscripción y tu rol."
          />
          <div className="mt-4 flex flex-wrap gap-3">
            {subscription.status === 'pendiente_activacion' ? (
              <Button type="button" onClick={activate}>
                <PlayIcon aria-hidden />
                Activar
              </Button>
            ) : null}
            {subscription.status === 'activa' ? (
              <Button type="button" onClick={startRenewal}>
                <RefreshCwIcon aria-hidden />
                Iniciar renovación
              </Button>
            ) : null}
            {RENEWABLE.includes(subscription.status) ? (
              <Button type="button" onClick={() => setDialog('renew')}>
                Renovar
              </Button>
            ) : null}
            {RENEWABLE.includes(subscription.status) ? (
              <Button type="button" variant="outline" onClick={() => setDialog('notRenewed')}>
                <BanIcon aria-hidden />
                No renovar
              </Button>
            ) : null}
            {RENEWABLE.includes(subscription.status) ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog('correctExpiration')}
              >
                <CalendarClockIcon aria-hidden />
                Corregir vencimiento
              </Button>
            ) : null}
            {isAdmin && !TERMINAL.includes(subscription.status) ? (
              <Button type="button" variant="destructive" onClick={() => setDialog('cancel')}>
                <XCircleIcon aria-hidden />
                Cancelar
              </Button>
            ) : null}
          </div>
        </BentoCard>
      </div>

      <PromptDialog
        open={dialog === 'renew'}
        onOpenChange={(o) => setDialog(o ? 'renew' : null)}
        title="Renovar suscripción"
        description={`Se creará un nuevo periodo para ${subscription.client.legalName}.`}
        submitLabel="Confirmar renovación"
        fields={[
          {
            name: 'priceAmount',
            label: 'Nuevo precio del periodo (COP)',
            type: 'number',
            defaultValue: String(subscription.priceAmount),
            min: 0,
            step: '0.01',
            validate: (v) => {
              const n = Number(v);
              return v && Number.isFinite(n) && n >= 0 ? null : 'Precio inválido.';
            },
          },
        ]}
        onSubmit={(v) => renew(Number(v.priceAmount))}
      />
      <PromptDialog
        open={dialog === 'notRenewed'}
        onOpenChange={(o) => setDialog(o ? 'notRenewed' : null)}
        title="Registrar no renovación"
        submitLabel="Registrar"
        fields={[
          {
            name: 'reason',
            label: 'Motivo de la no renovación (mín. 3 caracteres)',
            type: 'textarea',
            validate: minChars(3),
          },
        ]}
        onSubmit={(v) => markNotRenewed(v.reason ?? '')}
      />
      <PromptDialog
        open={dialog === 'correctExpiration'}
        onOpenChange={(o) => setDialog(o ? 'correctExpiration' : null)}
        title="Corregir vencimiento"
        submitLabel="Corregir"
        fields={[
          {
            name: 'date',
            label: 'Nueva fecha de vencimiento',
            type: 'date',
            defaultValue: subscription.currentPeriodEnd,
            validate: (v) =>
              /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Fecha inválida: usa AAAA-MM-DD.',
          },
          {
            name: 'reason',
            label: 'Motivo de la corrección (mín. 3 caracteres)',
            type: 'textarea',
            validate: minChars(3),
          },
        ]}
        onSubmit={(v) => correctExpiration(v.date ?? '', v.reason ?? '')}
      />
      <PromptDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => setDialog(o ? 'cancel' : null)}
        title="Cancelar suscripción"
        description="Esta acción es terminal y queda registrada en auditoría."
        submitLabel="Cancelar suscripción"
        destructive
        fields={[
          {
            name: 'reason',
            label: 'Motivo de la cancelación (mín. 3 caracteres)',
            type: 'textarea',
            validate: minChars(3),
          },
        ]}
        onSubmit={(v) => cancel(v.reason ?? '')}
      />
    </div>
  );
}
