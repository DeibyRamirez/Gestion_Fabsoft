'use client';

import { useCallback, useEffect, useState } from 'react';
import type { NotificationDto, NotificationPage } from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const selectClassName =
  'flex h-10 rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

const STATUS_LABELS: Record<NotificationDto['status'], string> = {
  pending: 'Pendiente',
  sent: 'Enviada',
  failed: 'Fallida',
  cancelled: 'Cancelada',
};

export function NotificationsPage() {
  const { token, user } = useAuth();
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [mine, setMine] = useState(true);
  const [unread, setUnread] = useState(false);
  const [status, setStatus] = useState('');
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <PageHeader
        breadcrumbs={['Gestión']}
        title="Alertas"
        description={
          page?.meta.unreadCount
            ? `${page.meta.unreadCount} alerta(s) sin leer.`
            : 'Bandeja de alertas y registro de envíos.'
        }
      />
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Sólo mis alertas
        </label>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={unread} onChange={(e) => setUnread(e.target.checked)} />
          Sólo no leídas
        </label>
        {!mine ? (
          <div className="grid gap-1">
            <label className="text-xs text-fg-muted" htmlFor="notification-status">
              Estado
            </label>
            <select
              id="notification-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectClassName}
            >
              <option value="">Todos</option>
              <option value="failed">Fallidas</option>
              <option value="pending">Pendientes</option>
              <option value="sent">Enviadas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </div>
        ) : null}
        <Button type="button" variant="outline" onClick={reload}>
          Actualizar
        </Button>
      </div>
      {page ? (
        page.data.length === 0 ? (
          <p className="text-sm text-fg-muted">No hay alertas con estos filtros.</p>
        ) : (
          <Card>
            <CardContent className="pt-6">
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
                  {page.data.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell>{n.title}</TableCell>
                      <TableCell>{n.channel === 'email' ? 'Correo' : 'En la app'}</TableCell>
                      <TableCell>
                        {STATUS_LABELS[n.status]}
                        {n.lastError ? (
                          <span className="block text-xs text-danger">{n.lastError}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{n.scheduledFor.slice(0, 16).replace('T', ' ')}</TableCell>
                      <TableCell>{n.recipient.fullName}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {n.channel === 'in_app' && n.status === 'sent' && !n.readAt ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void markRead(n.id)}
                            >
                              Marcar leída
                            </Button>
                          ) : null}
                          {isAdmin && n.status === 'failed' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void retry(n.id)}
                            >
                              Reintentar
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      ) : (
        <p>Cargando alertas…</p>
      )}
    </div>
  );
}
