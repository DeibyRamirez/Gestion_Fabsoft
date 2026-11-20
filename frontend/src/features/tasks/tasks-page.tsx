'use client';

import { useCallback, useEffect, useState } from 'react';
import { ListChecksIcon } from 'lucide-react';
import type { ClientDto, ClientPage, TaskPage } from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { BentoCard } from '@/shared/components/bento';
import { EmptyState } from '@/shared/components/empty-state';
import { FilterBar, FilterField } from '@/shared/components/filter-bar';
import { LoadingState } from '@/shared/components/loading-state';
import { PageHeader } from '@/shared/components/page-header';
import { SectionHeader } from '@/shared/components/section-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { TaskForm } from './task-form';
import { TasksTable } from './tasks-table';

export type TaskFilters = {
  status: string;
  priority: string;
  assignee: string;
  overdue: boolean;
  dueFrom: string;
  dueTo: string;
};

export const DEFAULT_TASK_FILTERS: TaskFilters = {
  status: 'pendiente,en_progreso',
  priority: '',
  assignee: '',
  overdue: false,
  dueFrom: '',
  dueTo: '',
};

export function TasksPage({
  initialFilters = DEFAULT_TASK_FILTERS,
}: {
  initialFilters?: TaskFilters;
}) {
  const { token, user } = useAuth();
  const [page, setPage] = useState<TaskPage | null>(null);
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState(initialFilters.status);
  const [priority, setPriority] = useState(initialFilters.priority);
  const [assignee, setAssignee] = useState(initialFilters.assignee);
  const [overdue, setOverdue] = useState(initialFilters.overdue);
  const [dueFrom, setDueFrom] = useState(initialFilters.dueFrom);
  const [dueTo, setDueTo] = useState(initialFilters.dueTo);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    apiFetch<ClientPage>('/clients?pageSize=100', { token })
      .then((p) => alive && setClients(p.data))
      .catch(() => alive && setClients([]));
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ pageSize: '50', sort: 'dueDate' });
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    if (assignee) params.set('assigneeUserId', assignee);
    if (overdue) params.set('overdue', 'true');
    if (dueFrom) params.set('dueFrom', dueFrom);
    if (dueTo) params.set('dueTo', dueTo);
    apiFetch<TaskPage>(`/renewal-tasks?${params.toString()}`, { token })
      .then((p) => alive && setPage(p))
      .catch(() => alive && setMessage('No se pudieron cargar las tareas.'));
    return () => {
      alive = false;
    };
  }, [token, status, priority, assignee, overdue, dueFrom, dueTo, version]);

  function clearFilters() {
    setStatus(DEFAULT_TASK_FILTERS.status);
    setPriority(DEFAULT_TASK_FILTERS.priority);
    setAssignee(DEFAULT_TASK_FILTERS.assignee);
    setOverdue(DEFAULT_TASK_FILTERS.overdue);
    setDueFrom(DEFAULT_TASK_FILTERS.dueFrom);
    setDueTo(DEFAULT_TASK_FILTERS.dueTo);
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title="Tareas"
        description="Seguimiento operativo de renovaciones y tareas manuales."
        actions={
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cerrar formulario' : 'Nueva tarea'}
          </Button>
        }
      />
      {message ? (
        <p role="status" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}
      {showForm && user ? (
        <BentoCard>
          <SectionHeader title="Nueva tarea manual" />
          <div className="mt-4">
            <TaskForm
              token={token}
              role={user.role}
              clients={clients}
              onCreated={() => {
                setShowForm(false);
                setMessage('Tarea creada.');
                reload();
              }}
            />
          </div>
        </BentoCard>
      ) : null}

      <FilterBar
        actions={
          <>
            <Button type="button" variant="ghost" onClick={clearFilters}>
              Limpiar
            </Button>
            <Button type="button" variant="outline" onClick={reload}>
              Actualizar
            </Button>
          </>
        }
      >
        <FilterField label="Estado" htmlFor="filter-status">
          <select
            id="filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={nativeSelectClassName}
          >
            <option value="pendiente,en_progreso">Abiertas</option>
            <option value="pendiente">Pendientes</option>
            <option value="en_progreso">En progreso</option>
            <option value="completada">Completadas</option>
            <option value="cancelada">Canceladas</option>
            <option value="">Todas</option>
          </select>
        </FilterField>
        <FilterField label="Prioridad" htmlFor="filter-priority">
          <select
            id="filter-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={nativeSelectClassName}
          >
            <option value="">Todas</option>
            <option value="urgent">Urgente</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
        </FilterField>
        <FilterField label="Responsable" htmlFor="filter-assignee">
          <select
            id="filter-assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className={nativeSelectClassName}
          >
            <option value="">Todos</option>
            <option value="me">Mis tareas</option>
          </select>
        </FilterField>
        <FilterField label="Vence desde" htmlFor="filter-due-from">
          <Input
            id="filter-due-from"
            type="date"
            value={dueFrom}
            onChange={(e) => setDueFrom(e.target.value)}
          />
        </FilterField>
        <FilterField label="Vence hasta" htmlFor="filter-due-to">
          <Input
            id="filter-due-to"
            type="date"
            value={dueTo}
            onChange={(e) => setDueTo(e.target.value)}
          />
        </FilterField>
        <div className="flex items-end">
          <label className="flex h-11 items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={overdue}
              onChange={(e) => setOverdue(e.target.checked)}
              className="size-4 rounded border-border-input accent-[var(--color-iris)]"
            />
            Sólo vencidas
          </label>
        </div>
      </FilterBar>

      {page ? (
        page.data.length === 0 ? (
          <EmptyState
            icon={ListChecksIcon}
            title="No hay tareas con estos filtros."
            action={
              <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="pt-5">
              <TasksTable page={page} clients={clients} />
            </CardContent>
          </Card>
        )
      ) : (
        <LoadingState label="Cargando tareas…" />
      )}
    </div>
  );
}
