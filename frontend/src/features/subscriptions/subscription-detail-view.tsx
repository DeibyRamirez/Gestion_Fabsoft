'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PaymentStatus, SubscriptionDetailDto, SubscriptionPeriodDto } from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const TERMINAL = ['cancelled', 'not_renewed'];
const RENEWABLE = ['active', 'in_renewal', 'expired'];
const PAYMENT_STATUSES: PaymentStatus[] = ['not_tracked', 'pending', 'received'];
const selectClassName =
  'flex h-10 w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

export function SubscriptionDetailView({ subscriptionId }: { subscriptionId: string }) {
  const { token, user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionDetailDto | null>(null);
  const [periods, setPeriods] = useState<SubscriptionPeriodDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
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
      reload();
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.problem?.code === 'version_conflict'
          ? 'La suscripción cambió; recarga e intenta de nuevo.'
          : err instanceof ApiError
            ? err.message
            : 'No se pudo completar la acción.',
      );
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

  function markNotRenewed() {
    if (!subscription) return;
    const reason = window.prompt('Motivo de la no renovación (mín. 3 caracteres)');
    if (!reason) return;
    void run(
      `/subscriptions/${subscription.id}/not-renewed`,
      { version: subscription.version, reason },
      'No renovación registrada.',
    );
  }

  function correctExpiration() {
    if (!subscription) return;
    const date = window.prompt(
      'Nueva fecha de vencimiento (AAAA-MM-DD)',
      subscription.currentPeriodEnd,
    );
    if (!date) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setMessage('Fecha inválida: usa AAAA-MM-DD.');
      return;
    }
    const reason = window.prompt('Motivo de la corrección (mín. 3 caracteres)');
    if (!reason) return;
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

  function renew() {
    if (!subscription) return;
    const raw = window.prompt('Nuevo precio del periodo (COP)', String(subscription.priceAmount));
    if (!raw) return;
    const priceAmount = Number(raw);
    if (!Number.isFinite(priceAmount) || priceAmount < 0) {
      setMessage('Precio inválido.');
      return;
    }
    void run(
      `/subscriptions/${subscription.id}/renew`,
      { version: subscription.version, newPeriod: { priceAmount: priceAmount.toFixed(2) } },
      'Suscripción renovada.',
    );
  }

  function cancel() {
    if (!subscription) return;
    const reason = window.prompt('Motivo de la cancelación (mín. 3 caracteres)');
    if (!reason) return;
    void run(
      `/subscriptions/${subscription.id}/cancel`,
      { version: subscription.version, reason },
      'Suscripción cancelada.',
    );
  }

  if (!subscription) return <p>{message ?? 'Cargando…'}</p>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        breadcrumbs={['Gestión', 'Suscripciones']}
        title={`${subscription.client.legalName} · ${subscription.product.name}`}
        description={`Estado: ${subscription.status}`}
      />
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vigencia</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>Inicio: {subscription.startDate}</p>
          <p>Vence: {subscription.currentPeriodEnd}</p>
          <p>Periodicidad: {subscription.billingCycle}</p>
          <p>Precio: {subscription.priceAmount} COP</p>
          <p>Pago del periodo: {subscription.currentPeriod?.paymentStatus ?? '—'}</p>
          <p>Seguimiento: {subscription.followUpStatus}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Historial de periodos</CardTitle>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <p className="text-sm text-fg-muted">Sin periodos.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.periodNumber}</TableCell>
                    <TableCell>{p.startDate}</TableCell>
                    <TableCell>{p.endDate}</TableCell>
                    <TableCell>{p.priceAmount}</TableCell>
                    <TableCell>
                      <label className="sr-only" htmlFor={`payment-${p.id}`}>
                        Pago del periodo {p.periodNumber}
                      </label>
                      <select
                        id={`payment-${p.id}`}
                        value={p.paymentStatus}
                        className={selectClassName}
                        onChange={(e) => updatePayment(p.id, e.target.value as PaymentStatus)}
                      >
                        {PAYMENT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-3">
        {subscription.status === 'pending_activation' ? (
          <Button type="button" onClick={activate}>
            Activar
          </Button>
        ) : null}
        {subscription.status === 'active' ? (
          <Button type="button" onClick={startRenewal}>
            Iniciar renovación
          </Button>
        ) : null}
        {RENEWABLE.includes(subscription.status) ? (
          <Button type="button" onClick={renew}>
            Renovar
          </Button>
        ) : null}
        {RENEWABLE.includes(subscription.status) ? (
          <Button type="button" variant="outline" onClick={markNotRenewed}>
            No renovar
          </Button>
        ) : null}
        {RENEWABLE.includes(subscription.status) ? (
          <Button type="button" variant="outline" onClick={correctExpiration}>
            Corregir vencimiento
          </Button>
        ) : null}
        {isAdmin && !TERMINAL.includes(subscription.status) ? (
          <Button type="button" variant="destructive" onClick={cancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
