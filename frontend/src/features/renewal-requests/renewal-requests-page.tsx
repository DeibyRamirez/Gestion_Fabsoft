'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { InboxIcon } from 'lucide-react';
import type {
  RenewalRequestDto,
  RenewalRequestPage,
  RenewalRequestResolution,
} from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PromptDialog } from '@/shared/components/action-dialog';
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
  AUDIT_ACTOR_TYPE_LABELS,
  RENEWAL_REQUEST_RESOLUTION_LABELS,
  RENEWAL_REQUEST_STATUS_LABELS,
} from '@/shared/lib/labels';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const RESOLUTIONS: RenewalRequestResolution[] = ['renovada', 'no_renovada', 'otra'];

export function RenewalRequestsPage({ initialStatus = '' }: { initialStatus?: string }) {
  const { token, user } = useAuth();
  const [page, setPage] = useState<RenewalRequestPage | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [acting, setActing] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<RenewalRequestDto | null>(null);

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
  }, [token, status, version]);

  const requestedByLabel = (request: RenewalRequestDto) =>
    request.requestedBy.name ?? AUDIT_ACTOR_TYPE_LABELS[request.requestedBy.actorType];

  async function updateRequest(
    id: string,
    payload: { status?: 'en_progreso'; assignedUserId?: string | null },
  ) {
    setActing(id);
    try {
      await apiFetch(`/renewal-requests/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(payload),
      });
      setMessage(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo actualizar la solicitud.');
    } finally {
      setActing(null);
    }
  }

  async function resolveRequest(id: string, values: Record<string, string>) {
    const resolution = values.resolution as RenewalRequestResolution;
    if (!RESOLUTIONS.includes(resolution)) {
      setMessage('Resolución inválida.');
      return;
    }
    setActing(id);
    try {
      await apiFetch(`/renewal-requests/${id}/resolve`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          resolution,
          resolutionNote: values.resolutionNote?.trim() || null,
        }),
      });
      setMessage(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo resolver la solicitud.');
    } finally {
      setActing(null);
    }
  }

  function actions(request: RenewalRequestDto) {
    if (!user || request.status === 'resuelta') return null;
    return (
      <div className="flex flex-wrap justify-end gap-1">
        {request.assignedUser?.id !== user.id ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={acting === request.id}
            onClick={() =>
              void updateRequest(request.id, {
                assignedUserId: user.id,
                status: 'en_progreso',
              })
            }
          >
            Asignarme
          </Button>
        ) : null}
        {request.status === 'pendiente_revision' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={acting === request.id}
            onClick={() => void updateRequest(request.id, { status: 'en_progreso' })}
          >
            En progreso
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={acting === request.id}
          onClick={() => setResolveTarget(request)}
        >
          Resolver
        </Button>
      </div>
    );
  }

  const desktop = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Creada</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Suscripción</TableHead>
          <TableHead>Solicitada por</TableHead>
          <TableHead>Responsable</TableHead>
          <TableHead>Resolución</TableHead>
          <TableHead>Comentario</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page?.data.map((request) => (
          <TableRow key={request.id}>
            <TableCell className="text-xs text-fg-muted">
              {formatDateTime(request.createdAt)}
            </TableCell>
            <TableCell>
              <StatusBadge kind="renewalRequest" value={request.status} />
            </TableCell>
            <TableCell>
              <Link
                className="font-semibold text-fg hover:text-link hover:underline"
                href={`/subscriptions/${request.subscriptionId}`}
              >
                Ver suscripción
              </Link>
            </TableCell>
            <TableCell className="text-fg-muted">{requestedByLabel(request)}</TableCell>
            <TableCell className="text-fg-muted">
              {request.assignedUser?.fullName ?? 'Sin asignar'}
            </TableCell>
            <TableCell className="text-fg-muted">
              {request.resolution ? RENEWAL_REQUEST_RESOLUTION_LABELS[request.resolution] : '—'}
            </TableCell>
            <TableCell className="max-w-64 truncate text-fg-muted">
              {request.comment ?? '—'}
            </TableCell>
            <TableCell>{actions(request)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const mobile = (
    <MobileCardList>
      {page?.data.map((request) => (
        <MobileCard key={request.id}>
          <div className="flex items-start justify-between gap-2">
            <Link
              className="font-semibold text-fg hover:text-link hover:underline"
              href={`/subscriptions/${request.subscriptionId}`}
            >
              Solicitud de renovación
            </Link>
            <StatusBadge kind="renewalRequest" value={request.status} />
          </div>
          <p className="text-xs text-fg-muted">
            {formatDateTime(request.createdAt)} · {requestedByLabel(request)}
          </p>
          <p className="text-xs text-fg-muted">
            Responsable: {request.assignedUser?.fullName ?? 'Sin asignar'}
          </p>
          {request.resolution ? (
            <p className="text-xs text-fg-muted">
              Resolución: {RENEWAL_REQUEST_RESOLUTION_LABELS[request.resolution]}
            </p>
          ) : null}
          {request.comment ? <p className="text-sm text-fg">{request.comment}</p> : null}
          {actions(request)}
        </MobileCard>
      ))}
    </MobileCardList>
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title="Solicitudes de renovación"
        description="Solicitudes creadas por clientes, el equipo o integraciones."
      />

      {message ? (
        <p role="status" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}

      <FilterBar
        actions={
          <Button type="button" variant="outline" onClick={() => setVersion((v) => v + 1)}>
            Actualizar
          </Button>
        }
      >
        <FilterField label="Estado" htmlFor="request-status">
          <select
            id="request-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={nativeSelectClassName}
          >
            <option value="">Todas</option>
            <option value="pendiente_revision">
              {RENEWAL_REQUEST_STATUS_LABELS.pendiente_revision}
            </option>
            <option value="en_progreso">{RENEWAL_REQUEST_STATUS_LABELS.en_progreso}</option>
            <option value="resuelta">{RENEWAL_REQUEST_STATUS_LABELS.resuelta}</option>
          </select>
        </FilterField>
      </FilterBar>

      {page ? (
        page.data.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title="No hay solicitudes con estos filtros."
            description="Las solicitudes de renovación de clientes e integraciones aparecerán aquí."
          />
        ) : (
          <Card>
            <CardContent className="pt-5">
              <ResponsiveDataView desktop={desktop} mobile={mobile} />
            </CardContent>
          </Card>
        )
      ) : (
        <LoadingState label="Cargando solicitudes…" />
      )}

      <PromptDialog
        open={resolveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResolveTarget(null);
        }}
        title="Resolver solicitud"
        description="Registra el resultado comercial. Si eliges “Renovada”, debe existir una renovación confirmada posterior a la solicitud."
        submitLabel="Resolver"
        fields={[
          {
            name: 'resolution',
            label: 'Resolución',
            type: 'select',
            defaultValue: 'renovada',
            options: RESOLUTIONS.map((value) => ({
              value,
              label: RENEWAL_REQUEST_RESOLUTION_LABELS[value],
            })),
          },
          {
            name: 'resolutionNote',
            label: 'Nota (opcional)',
            type: 'textarea',
            validate: () => null,
          },
        ]}
        onSubmit={(values) => {
          if (resolveTarget) void resolveRequest(resolveTarget.id, values);
        }}
      />
    </div>
  );
}
