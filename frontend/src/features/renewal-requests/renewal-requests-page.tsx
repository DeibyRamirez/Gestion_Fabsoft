'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RenewalRequestPage, RenewalRequestStatus } from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { Card, CardContent } from '@/shared/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const selectClassName =
  'flex h-10 w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

const STATUS_LABELS: Record<RenewalRequestStatus, string> = {
  pending_review: 'Pendiente de revisión',
  in_progress: 'En progreso',
  resolved: 'Resuelta',
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(value));

export function RenewalRequestsPage({ initialStatus = '' }: { initialStatus?: string }) {
  const { token } = useAuth();
  const [page, setPage] = useState<RenewalRequestPage | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ pageSize: '50', sort: '-createdAt' });
    if (status) params.set('status', status);
    apiFetch<RenewalRequestPage>(`/renewal-requests?${params.toString()}`, { token })
      .then((result) => {
        if (!alive) return;
        setPage(result);
        setMessage(null);
      })
      .catch(() => {
        if (alive) setMessage('No se pudieron cargar las solicitudes.');
      });
    return () => {
      alive = false;
    };
  }, [token, status]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <PageHeader
        breadcrumbs={['Gestión']}
        title="Solicitudes de renovación"
        description="Solicitudes creadas por clientes, el equipo o integraciones. La gestión completa llegará con HU-14."
      />

      {message ? (
        <div role="status" className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
          {message}
        </div>
      ) : null}

      <div className="grid max-w-60 gap-1">
        <label className="text-xs text-fg-muted" htmlFor="request-status">
          Estado
        </label>
        <select
          id="request-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClassName}
        >
          <option value="">Todas</option>
          <option value="pending_review">Pendientes de revisión</option>
          <option value="in_progress">En progreso</option>
          <option value="resolved">Resueltas</option>
        </select>
      </div>

      {page ? (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Creada</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Suscripción</TableHead>
                  <TableHead>Solicitada por</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Comentario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.data.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{formatDate(request.createdAt)}</TableCell>
                    <TableCell>{STATUS_LABELS[request.status]}</TableCell>
                    <TableCell>
                      <Link
                        className="text-link hover:underline"
                        href={`/subscriptions/${request.subscriptionId}`}
                      >
                        Ver suscripción
                      </Link>
                    </TableCell>
                    <TableCell>{request.requestedBy.name ?? request.requestedBy.actorType}</TableCell>
                    <TableCell>{request.assignedUser?.fullName ?? 'Sin asignar'}</TableCell>
                    <TableCell className="max-w-64 truncate">
                      {request.comment ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {page.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>No hay solicitudes con estos filtros.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <p aria-busy="true">Cargando solicitudes…</p>
      )}
    </div>
  );
}
