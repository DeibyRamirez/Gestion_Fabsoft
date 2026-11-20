'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { InboxIcon, ListChecksIcon, RepeatIcon } from 'lucide-react';
import type { ClientDto, RenewalRequestPage, SubscriptionPage, TaskPage } from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';
import { BentoCard } from '@/shared/components/bento';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadingState } from '@/shared/components/loading-state';
import { SectionHeader } from '@/shared/components/section-header';
import { formatDateTime } from '@/shared/lib/format';
import { RENEWAL_REQUEST_RESOLUTION_LABELS } from '@/shared/lib/labels';
import { Button } from '@/shared/ui/button';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { SubscriptionsTable } from '@/features/subscriptions/subscriptions-table';
import { TasksTable } from '@/features/tasks/tasks-table';

export function ClientRelatedPanels({
  clientId,
  token,
  client,
}: {
  clientId: string;
  token: string | null;
  client: ClientDto;
}) {
  const [subscriptions, setSubscriptions] = useState<SubscriptionPage | null>(null);
  const [tasks, setTasks] = useState<TaskPage | null>(null);
  const [requests, setRequests] = useState<RenewalRequestPage | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch<SubscriptionPage>(`/subscriptions?clientId=${clientId}&pageSize=20`, { token }),
      apiFetch<TaskPage>(`/renewal-tasks?clientId=${clientId}&pageSize=20`, { token }),
      apiFetch<RenewalRequestPage>(`/renewal-requests?clientId=${clientId}&pageSize=20`, { token }),
    ])
      .then(([subscriptionPage, taskPage, requestPage]) => {
        if (!alive) return;
        setSubscriptions(subscriptionPage);
        setTasks(taskPage);
        setRequests(requestPage);
        setMessage(null);
      })
      .catch(() => {
        if (alive) setMessage('No se pudo cargar la información relacionada.');
      });
    return () => {
      alive = false;
    };
  }, [clientId, token]);

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <BentoCard className="lg:col-span-7">
        <SectionHeader
          title="Suscripciones"
          description="Licencias y servicios contratados por este cliente."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/subscriptions">Ver todas</Link>
            </Button>
          }
        />
        <div className="mt-4">
          {message && !subscriptions ? (
            <p role="status" className="text-sm text-fg-muted">
              {message}
            </p>
          ) : !subscriptions ? (
            <LoadingState label="Cargando suscripciones…" />
          ) : subscriptions.data.length === 0 ? (
            <EmptyState
              icon={RepeatIcon}
              title="Sin suscripciones registradas."
              description="Crea una suscripción desde el módulo de suscripciones."
            />
          ) : (
            <SubscriptionsTable page={subscriptions} />
          )}
        </div>
      </BentoCard>

      <BentoCard className="lg:col-span-5">
        <SectionHeader
          title="Tareas"
          description="Seguimiento interno relacionado con el cliente."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/tasks">Ver todas</Link>
            </Button>
          }
        />
        <div className="mt-4">
          {message && !tasks ? (
            <p role="status" className="text-sm text-fg-muted">
              {message}
            </p>
          ) : !tasks ? (
            <LoadingState label="Cargando tareas…" />
          ) : tasks.data.length === 0 ? (
            <EmptyState
              icon={ListChecksIcon}
              title="Sin tareas registradas."
              description="Las tareas de seguimiento aparecerán aquí."
            />
          ) : (
            <TasksTable page={tasks} clients={[client]} />
          )}
        </div>
      </BentoCard>

      <BentoCard className="lg:col-span-12">
        <SectionHeader
          title="Solicitudes de renovación"
          description="Solicitudes del cliente, del equipo o de integraciones."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/renewal-requests">Ver todas</Link>
            </Button>
          }
        />
        <div className="mt-4">
          {message && !requests ? (
            <p role="status" className="text-sm text-fg-muted">
              {message}
            </p>
          ) : !requests ? (
            <LoadingState label="Cargando solicitudes…" />
          ) : requests.data.length === 0 ? (
            <EmptyState
              icon={InboxIcon}
              title="Sin solicitudes registradas."
              description="Las solicitudes de renovación aparecerán aquí."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Creada</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Suscripción</TableHead>
                  <TableHead>Resolución</TableHead>
                  <TableHead>Comentario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.data.map((request) => (
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
                    <TableCell className="text-fg-muted">
                      {request.resolution
                        ? RENEWAL_REQUEST_RESOLUTION_LABELS[request.resolution]
                        : '—'}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-fg-muted">
                      {request.comment ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </BentoCard>
    </div>
  );
}
