'use client';

import { useEffect, useState } from 'react';
import type { ClientActivityDto, ClientActivityPage } from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(value));

const actorLabel = (activity: ClientActivityDto): string => activity.actor?.name ?? 'Sistema';

export function ActivityPanel({ clientId, token }: { clientId: string; token: string | null }) {
  const [page, setPage] = useState<ClientActivityPage | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<ClientActivityPage>(`/clients/${clientId}/activity?pageSize=20`, { token })
      .then((result) => {
        if (alive) setPage(result);
      })
      .catch((err) => {
        if (alive) {
          setPage(null);
          setMessage(
            err instanceof ApiError ? err.message : 'No se pudo cargar la actividad del cliente.',
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [clientId, token]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Actividad</CardTitle>
        <CardDescription>
          Últimos eventos del cliente. Esta vista no expone valores before/after.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {message ? (
          <p role="status" className="text-sm text-fg">
            {message}
          </p>
        ) : page === null ? (
          <p role="status" aria-busy="true" className="text-sm text-fg-muted">
            Cargando actividad…
          </p>
        ) : page.data.length === 0 ? (
          <p className="text-sm text-fg-muted">Sin actividad registrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Resumen</TableHead>
                <TableHead>Recurso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((activity) => (
                <TableRow key={activity.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(activity.occurredAt)}
                  </TableCell>
                  <TableCell>{actorLabel(activity)}</TableCell>
                  <TableCell>
                    <span className="block">{activity.summary}</span>
                    <span className="font-mono text-xs text-fg-muted">{activity.action}</span>
                  </TableCell>
                  <TableCell>
                    <span className="block">{activity.resourceType}</span>
                    <span className="font-mono text-xs text-fg-muted">{activity.resourceId}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
