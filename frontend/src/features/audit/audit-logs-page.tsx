'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { HistoryIcon } from 'lucide-react';
import type { ActorType, AuditLogDto, AuditLogPage } from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { EmptyState } from '@/shared/components/empty-state';
import { FilterBar, FilterField } from '@/shared/components/filter-bar';
import { LoadingState } from '@/shared/components/loading-state';
import { PageHeader } from '@/shared/components/page-header';
import { formatDateTime } from '@/shared/lib/format';
import { AUDIT_ACTOR_TYPE_LABELS } from '@/shared/lib/labels';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

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
  return AUDIT_ACTOR_TYPE_LABELS[log.actorType];
};

function ChangesCell({ changes }: { changes: AuditLogDto['changes'] }) {
  if (!changes) return <span className="text-fg-muted">—</span>;
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-link">Ver before/after</summary>
      <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-border bg-bg p-3 font-mono text-xs">
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
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title="Auditoría"
        description="Registro append-only de cambios sensibles. Solo administradores. Conserva before/after."
      />

      {message ? (
        <p role="status" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}

      <form onSubmit={applyFilters}>
        <FilterBar
          actions={
            <>
              <Button type="button" variant="outline" onClick={clearFilters} disabled={loading}>
                Limpiar
              </Button>
              <Button type="submit" disabled={loading}>
                Aplicar filtros
              </Button>
            </>
          }
        >
          <FilterField label="Tipo de actor" htmlFor="audit-actor-type">
            <select
              id="audit-actor-type"
              value={draft.actorType}
              onChange={(e) => set('actorType', e.target.value as Filters['actorType'])}
              className={nativeSelectClassName}
            >
              <option value="">Todos</option>
              <option value="user">Usuario</option>
              <option value="integration">Integración</option>
              <option value="system">Sistema</option>
            </select>
          </FilterField>
          <FilterField label="Acción" htmlFor="audit-action">
            <Input
              id="audit-action"
              placeholder="subscription.updated"
              value={draft.action}
              onChange={(e) => set('action', e.target.value)}
            />
          </FilterField>
          <FilterField label="Tipo de recurso" htmlFor="audit-resource-type">
            <Input
              id="audit-resource-type"
              placeholder="subscription"
              value={draft.resourceType}
              onChange={(e) => set('resourceType', e.target.value)}
            />
          </FilterField>
          <FilterField label="Cliente" htmlFor="audit-client-id">
            <Input
              id="audit-client-id"
              placeholder="UUID del cliente"
              value={draft.clientId}
              onChange={(e) => set('clientId', e.target.value)}
            />
          </FilterField>
          <FilterField label="Desde" htmlFor="audit-from">
            <Input
              id="audit-from"
              type="datetime-local"
              value={draft.from}
              onChange={(e) => set('from', e.target.value)}
            />
          </FilterField>
          <FilterField label="Hasta" htmlFor="audit-to">
            <Input
              id="audit-to"
              type="datetime-local"
              value={draft.to}
              onChange={(e) => set('to', e.target.value)}
            />
          </FilterField>
        </FilterBar>
      </form>

      <Card>
        <CardContent className="pt-5">
          {loading ? (
            <LoadingState label="Cargando auditoría…" />
          ) : page && page.data.length === 0 ? (
            <EmptyState icon={HistoryIcon} title="Sin eventos de auditoría para los filtros." />
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
                      <TableCell className="whitespace-nowrap text-xs text-fg-muted">
                        {formatDateTime(log.occurredAt)}
                      </TableCell>
                      <TableCell>
                        <span className="block font-semibold text-fg">{actorLabel(log)}</span>
                        <span className="text-xs text-fg-muted">
                          {AUDIT_ACTOR_TYPE_LABELS[log.actorType]}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.action}</TableCell>
                      <TableCell>
                        <span className="block text-sm">{log.resourceType}</span>
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
