'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { AuditLogDto, AuditLogPage, ActorType } from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const selectClassName =
  'flex h-10 w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

const PAGE_SIZE = 20;

type Filters = {
  actorType: '' | ActorType;
  action: string;
  resourceType: string;
  clientId: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = {
  actorType: '',
  action: '',
  resourceType: '',
  clientId: '',
  from: '',
  to: '',
};

const actorLabel = (log: AuditLogDto): string => {
  if (log.actor) return log.actor.name;
  return log.actorType === 'system' ? 'Sistema' : '—';
};

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(value));

function ChangesCell({ changes }: { changes: AuditLogDto['changes'] }) {
  if (!changes) return <span className="text-fg-muted">—</span>;
  return (
    <details>
      <summary className="cursor-pointer text-link">Ver before/after</summary>
      <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-border bg-bg p-3 text-xs">
        {JSON.stringify(changes, null, 2)}
      </pre>
    </details>
  );
}

export function AuditLogsPage() {
  const { token } = useAuth();
  const [page, setPage] = useState<AuditLogPage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [pageNumber, setPageNumber] = useState(1);
  const [requestVersion, setRequestVersion] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({
      page: String(pageNumber),
      pageSize: String(PAGE_SIZE),
    });
    if (filters.actorType) params.set('actorType', filters.actorType);
    if (filters.action.trim()) params.set('action', filters.action.trim());
    if (filters.resourceType.trim()) params.set('resourceType', filters.resourceType.trim());
    if (filters.clientId.trim()) params.set('clientId', filters.clientId.trim());
    if (filters.from) params.set('from', new Date(filters.from).toISOString());
    if (filters.to) params.set('to', new Date(filters.to).toISOString());

    apiFetch<AuditLogPage>(`/audit-logs?${params}`, { token })
      .then((result) => {
        if (!alive) return;
        setPage(result);
        setMessage(null);
      })
      .catch((err) => {
        if (!alive) return;
        setPage(null);
        setMessage(
          err instanceof ApiError ? err.message : 'No se pudo cargar el registro de auditoría.',
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, pageNumber, filters, requestVersion]);

  function applyFilters(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setPageNumber(1);
    setFilters({ ...draft });
    setRequestVersion((v) => v + 1);
  }

  function clearFilters() {
    setLoading(true);
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPageNumber(1);
    setRequestVersion((v) => v + 1);
  }

  function goToPage(next: number) {
    setLoading(true);
    setPageNumber(Math.max(1, next));
  }

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8">
      <PageHeader
        breadcrumbs={['Admin']}
        title="Auditoría"
        description="Registro append-only de cambios sensibles. Solo administradores. Conserva before/after."
      />

      {message ? (
        <div
          role="status"
          className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-fg"
        >
          {message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
          <CardDescription>
            Filtra por actor, acción, recurso, cliente o rango de fechas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={applyFilters} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="audit-actor-type">Tipo de actor</Label>
              <select
                id="audit-actor-type"
                value={draft.actorType}
                onChange={(e) => set('actorType', e.target.value as Filters['actorType'])}
                className={selectClassName}
              >
                <option value="">Todos</option>
                <option value="user">Usuario</option>
                <option value="integration">Integración</option>
                <option value="system">Sistema</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="audit-action">Acción</Label>
              <Input
                id="audit-action"
                placeholder="subscription.updated"
                value={draft.action}
                onChange={(e) => set('action', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="audit-resource-type">Tipo de recurso</Label>
              <Input
                id="audit-resource-type"
                placeholder="subscription"
                value={draft.resourceType}
                onChange={(e) => set('resourceType', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="audit-client-id">Cliente</Label>
              <Input
                id="audit-client-id"
                placeholder="UUID del cliente"
                value={draft.clientId}
                onChange={(e) => set('clientId', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="audit-from">Desde</Label>
              <Input
                id="audit-from"
                type="datetime-local"
                value={draft.from}
                onChange={(e) => set('from', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="audit-to">Hasta</Label>
              <Input
                id="audit-to"
                type="datetime-local"
                value={draft.to}
                onChange={(e) => set('to', e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-end gap-3 md:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={loading}>
                Aplicar filtros
              </Button>
              <Button type="button" variant="outline" onClick={clearFilters} disabled={loading}>
                Limpiar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Eventos</CardTitle>
          <CardDescription>Más reciente primero.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p role="status" aria-busy="true" className="text-sm text-fg-muted">
              Cargando auditoría…
            </p>
          ) : page && page.data.length === 0 ? (
            <p className="text-sm text-fg-muted">Sin eventos de auditoría para los filtros.</p>
          ) : page ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Cambios</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.data.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(log.occurredAt)}
                      </TableCell>
                      <TableCell>
                        <span className="block">{actorLabel(log)}</span>
                        <span className="text-xs text-fg-muted">{log.actorType}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.action}</TableCell>
                      <TableCell>
                        <span className="block">{log.resourceType}</span>
                        <span className="font-mono text-xs text-fg-muted">{log.resourceId}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.clientId ?? '—'}</TableCell>
                      <TableCell>
                        <ChangesCell changes={log.changes} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-fg-muted">
                  Página {page.meta.page} de {Math.max(page.meta.totalPages, 1)} · {page.meta.total}{' '}
                  eventos
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pageNumber <= 1}
                    onClick={() => goToPage(pageNumber - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pageNumber >= Math.max(page.meta.totalPages, 1)}
                    onClick={() => goToPage(pageNumber + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
