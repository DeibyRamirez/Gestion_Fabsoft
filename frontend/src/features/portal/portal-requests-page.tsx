'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { InboxIcon } from 'lucide-react';
import type { PortalRenewalRequest } from '@fabsoft/shared';
import { useAuth } from '@/features/auth/auth-provider';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadingState } from '@/shared/components/loading-state';
import { PageHeader } from '@/shared/components/page-header';
import {
  MobileCard,
  MobileCardList,
  ResponsiveDataView,
} from '@/shared/components/responsive-data-view';
import { formatDateTime } from '@/shared/lib/format';
import { RENEWAL_REQUEST_RESOLUTION_LABELS } from '@/shared/lib/labels';
import { Card, CardContent } from '@/shared/ui/card';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { portalApi } from './api';

export function PortalRequestsPage() {
  const { token } = useAuth();
  const [requests, setRequests] = useState<PortalRenewalRequest[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    portalApi
      .renewalRequests(token)
      .then((page) => {
        if (!alive) return;
        setRequests(page.data);
        setMessage(null);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) {
          setMessage('No se pudieron cargar las solicitudes.');
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const desktop = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Creada</TableHead>
          <TableHead>Producto</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Comentario</TableHead>
          <TableHead>Resolución</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => (
          <TableRow key={request.id}>
            <TableCell className="text-xs text-fg-muted">
              {formatDateTime(request.createdAt)}
            </TableCell>
            <TableCell>
              <Link
                className="font-semibold text-fg hover:text-link hover:underline"
                href={`/portal/subscriptions/${request.subscriptionId}`}
              >
                {request.productName ?? 'Ver suscripción'}
              </Link>
            </TableCell>
            <TableCell>
              <StatusBadge kind="renewalRequest" value={request.status} />
            </TableCell>
            <TableCell className="max-w-64 truncate text-fg-muted">
              {request.comment ?? '—'}
            </TableCell>
            <TableCell className="text-fg-muted">
              {request.resolution ? RENEWAL_REQUEST_RESOLUTION_LABELS[request.resolution] : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const mobile = (
    <MobileCardList>
      {requests.map((request) => (
        <MobileCard key={request.id}>
          <div className="flex items-start justify-between gap-2">
            <Link
              className="font-semibold text-fg hover:text-link hover:underline"
              href={`/portal/subscriptions/${request.subscriptionId}`}
            >
              {request.productName ?? 'Ver suscripción'}
            </Link>
            <StatusBadge kind="renewalRequest" value={request.status} />
          </div>
          <p className="text-xs text-fg-muted">{formatDateTime(request.createdAt)}</p>
          {request.comment ? <p className="text-sm text-fg">{request.comment}</p> : null}
          {request.resolution ? (
            <p className="text-xs text-fg-muted">
              Resolución: {RENEWAL_REQUEST_RESOLUTION_LABELS[request.resolution]}
            </p>
          ) : null}
        </MobileCard>
      ))}
    </MobileCardList>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Mis solicitudes"
        description="Estado de las solicitudes de renovación enviadas a FabSoft."
      />
      {message ? (
        <p role="status" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}
      {!loaded ? (
        <LoadingState label="Cargando solicitudes…" />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="Todavía no has enviado solicitudes de renovación."
          description="Cuando solicites una renovación, podrás seguir su estado aquí."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <ResponsiveDataView desktop={desktop} mobile={mobile} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
