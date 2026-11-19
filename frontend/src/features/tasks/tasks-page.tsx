'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClientDto, ClientPage, TaskPage } from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { TaskForm } from './task-form';
import { TasksTable } from './tasks-table';

const selectClassName =
  'flex h-10 rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

export function TasksPage() {
  const { token, user } = useAuth();
  const [page, setPage] = useState<TaskPage | null>(null);
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState('pending,in_progress');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [overdue, setOverdue] = useState(false);
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
    apiFetch<TaskPage>(`/renewal-tasks?${params.toString()}`, { token })
      .then((p) => alive && setPage(p))
      .catch(() => alive && setMessage('No se pudieron cargar las tareas.'));
    return () => {
      alive = false;
    };
  }, [token, status, priority, assignee, overdue, version]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <PageHeader
        breadcrumbs={['Gestión']}
        title="Tareas"
        description="Seguimiento operativo de renovaciones y tareas manuales."
        actions={
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cerrar formulario' : 'Nueva tarea'}
          </Button>
        }
      />
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      {showForm && user ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nueva tarea manual</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label className="text-xs text-fg-muted" htmlFor="filter-status">
            Estado
          </label>
          <select
            id="filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectClassName}
          >
            <option value="pending,in_progress">Abiertas</option>
            <option value="pending">Pendientes</option>
            <option value="in_progress">En progreso</option>
            <option value="completed">Completadas</option>
            <option value="cancelled">Canceladas</option>
            <option value="">Todas</option>
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-fg-muted" htmlFor="filter-priority">
            Prioridad
          </label>
          <select
            id="filter-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={selectClassName}
          >
            <option value="">Todas</option>
            <option value="urgent">Urgente</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-fg-muted" htmlFor="filter-assignee">
            Responsable
          </label>
          <select
            id="filter-assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className={selectClassName}
          >
            <option value="">Todos</option>
            <option value="me">Mis tareas</option>
          </select>
        </div>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
          Sólo vencidas
        </label>
        <Button type="button" variant="outline" onClick={reload}>
          Actualizar
        </Button>
      </div>
      {page ? (
        page.data.length === 0 ? (
          <p className="text-sm text-fg-muted">No hay tareas con estos filtros.</p>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <TasksTable page={page} clients={clients} />
            </CardContent>
          </Card>
        )
      ) : (
        <p>Cargando tareas…</p>
      )}
    </div>
  );
}
