'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellIcon } from 'lucide-react';
import type { NotificationDto, NotificationPage } from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { EmptyState } from '@/shared/components/empty-state';
import { FilterBar, FilterField } from '@/shared/components/filter-bar';
import { LoadingState } from '@/shared/components/loading-state';
import { PageHeader } from '@/shared/components/page-header';
import {
  MobileCard,
  MobileCardList,
  ResponsiveDataView,
} from '@/shared/components/responsive-data-view';
import { formatDateTime } from '@/shared/lib/format';
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_STATUS_LABELS,
  NOTIFICATION_TYPE_LABELS,
} from '@/shared/lib/labels';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

export function NotificationsPage({ initialStatus = '' }: { initialStatus?: string }) {
  const { token, user } = useAuth();
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [mine, setMine] = useState(true);
  const [unread, setUnread] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ pageSize: '50' });
    if (mine) params.set('mine', 'true');
    if (unread) params.set('unread', 'true');
    if (status) params.set('status', status);
    apiFetch<NotificationPage>(`/notifications?${params.toString()}`, { token })
      .then((p) => alive && setPage(p))
      .catch(() => alive && setMessage('No se pudieron cargar las alertas.'));
    return () => {
      alive = false;
    };
  }, [token, mine, unread, status, version]);

  useEffect(() => {
    const timer = setInterval(reload, 60_000);
    return () => clearInterval(timer);
  }, [reload]);

  async function markRead(id: string) {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: 'POST', token });
      reload();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo marcar como leída.');
    }
  }

  async function retry(id: string) {
    try {
      await apiFetch<NotificationDto>(`/notifications/${id}/retry`, { method: 'POST', token });
      setMessage('Alerta reprogramada.');
      reload();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo reintentar.');
    }
  }

  function actionsFor(notification: NotificationDto) {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {notification.channel === 'in_app' &&
        notification.status === 'enviada' &&
        !notification.readAt ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void markRead(notification.id)}
          >
            Marcar leída
          </Button>
        ) : null}
        {isAdmin && notification.status === 'fallida' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void retry(notification.id)}
          >
            Reintentar
          </Button>
        ) : null}
      </div>
    );
  }

  const desktop = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Alerta</TableHead>
          <TableHead>Canal</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Programada</TableHead>
          <TableHead>Destinatario</TableHead>
          <TableHead>
            <span className="sr-only">Acciones</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page?.data.map((notification) => (
          <TableRow key={notification.id}>
            <TableCell>
              <span className="block font-semibold text-fg">{notification.title}</span>
              <span className="block text-xs text-fg-muted">
                {NOTIFICATION_TYPE_LABELS[notification.notificationType]}
              </span>
            </TableCell>
            <TableCell className="text-fg-muted">
              {NOTIFICATION_CHANNEL_LABELS[notification.channel]}
            </TableCell>
            <TableCell>
              <StatusBadge kind="notification" value={notification.status} />
              {notification.lastError ? (
                <span className="mt-1 block text-xs text-status-expired-fg">
                  {notification.lastError}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="text-xs text-fg-muted">
              {formatDateTime(notification.scheduledFor)}
            </TableCell>
            <TableCell className="text-fg-muted">{notification.recipient.fullName}</TableCell>
            <TableCell>{actionsFor(notification)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const mobile = (
    <MobileCardList>
      {page?.data.map((notification) => (
        <MobileCard key={notification.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-fg">{notification.title}</p>
              <p className="text-xs text-fg-muted">
                {NOTIFICATION_TYPE_LABELS[notification.notificationType]} ·{' '}
                {NOTIFICATION_CHANNEL_LABELS[notification.channel]}
              </p>
            </div>
            <StatusBadge kind="notification" value={notification.status} />
          </div>
          <p className="text-xs text-fg-muted">
            {formatDateTime(notification.scheduledFor)} · {notification.recipient.fullName}
          </p>
          {notification.lastError ? (
            <p className="text-xs text-status-expired-fg">{notification.lastError}</p>
          ) : null}
          {actionsFor(notification)}
        </MobileCard>
      ))}
    </MobileCardList>
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title="Alertas"
        description={
          page?.meta.unreadCount
            ? `${page.meta.unreadCount} alerta(s) sin leer.`
            : 'Bandeja de alertas y registro de envíos.'
        }
      />
      {message ? (
        <p role="status" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}

      <FilterBar
        actions={
          <Button type="button" variant="outline" onClick={reload}>
            Actualizar
          </Button>
        }
      >
        <div className="flex items-end">
          <label className="flex h-11 items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
              className="size-4 rounded border-border-input accent-[var(--color-iris)]"
            />
            Sólo mis alertas
          </label>
        </div>
        <div className="flex items-end">
          <label className="flex h-11 items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={unread}
              onChange={(e) => setUnread(e.target.checked)}
              className="size-4 rounded border-border-input accent-[var(--color-iris)]"
            />
            Sólo no leídas
          </label>
        </div>
        {!mine ? (
          <FilterField label="Estado" htmlFor="notification-status">
            <select
              id="notification-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={nativeSelectClassName}
            >
              <option value="">Todos</option>
              <option value="fallida">{NOTIFICATION_STATUS_LABELS.fallida}</option>
              <option value="pendiente">{NOTIFICATION_STATUS_LABELS.pendiente}</option>
              <option value="enviada">{NOTIFICATION_STATUS_LABELS.enviada}</option>
              <option value="cancelada">{NOTIFICATION_STATUS_LABELS.cancelada}</option>
            </select>
          </FilterField>
        ) : null}
      </FilterBar>

      {page ? (
        page.data.length === 0 ? (
          <EmptyState icon={BellIcon} title="No hay alertas con estos filtros." />
        ) : (
          <Card>
            <CardContent className="pt-5">
              <ResponsiveDataView desktop={desktop} mobile={mobile} />
            </CardContent>
          </Card>
        )
      ) : (
        <LoadingState label="Cargando alertas…" />
      )}
    </div>
  );
}
