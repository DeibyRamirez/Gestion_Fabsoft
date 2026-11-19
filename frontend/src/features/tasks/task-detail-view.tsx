'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  TaskUpdateSchema,
  type ClientDto,
  type SubscriptionDetailDto,
  type TaskDto,
  type UserDto,
  type UserPage,
} from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  TASK_ORIGIN_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
} from './labels';

const selectClassName =
  'flex h-10 w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

export function TaskDetailView({ taskId }: { taskId: string }) {
  const { token, user } = useAuth();
  const [task, setTask] = useState<TaskDto | null>(null);
  const [client, setClient] = useState<ClientDto | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionDetailDto | null>(null);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);
  const isAdmin = user?.role === 'admin';
  const isOpen = task?.status === 'pending' || task?.status === 'in_progress';

  useEffect(() => {
    let alive = true;
    apiFetch<TaskDto>(`/renewal-tasks/${taskId}`, { token })
      .then(async (t) => {
        if (!alive) return;
        setTask(t);
        const requests: Promise<unknown>[] = [
          apiFetch<ClientDto>(`/clients/${t.clientId}`, { token })
            .then((c) => alive && setClient(c))
            .catch(() => undefined),
        ];
        if (t.subscriptionId) {
          requests.push(
            apiFetch<SubscriptionDetailDto>(`/subscriptions/${t.subscriptionId}`, { token })
              .then((s) => alive && setSubscription(s))
              .catch(() => undefined),
          );
        }
        if (isAdmin) {
          requests.push(
            apiFetch<UserPage>('/users?pageSize=100&status=active', { token })
              .then((p) => alive && setUsers(p.data.filter((u) => u.role !== 'client')))
              .catch(() => undefined),
          );
        }
        await Promise.all(requests);
      })
      .catch(() => alive && setMessage('Tarea no encontrada.'));
    return () => {
      alive = false;
    };
  }, [taskId, token, isAdmin, version]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!task) return;
    const data = new FormData(e.currentTarget);
    const parsed = TaskUpdateSchema.safeParse({
      version: task.version,
      title: data.get('title'),
      assigneeUserId: data.get('assigneeUserId') || null,
      priority: data.get('priority'),
      dueDate: data.get('dueDate'),
      status: data.get('status'),
      notes: data.get('notes') || null,
      nextAction: data.get('nextAction') || null,
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    try {
      const updated = await apiFetch<TaskDto>(`/renewal-tasks/${task.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(parsed.data),
      });
      setTask(updated);
      setMessage('Cambios guardados.');
      reload();
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.problem?.code === 'version_conflict'
          ? 'La tarea cambió; recarga e intenta de nuevo.'
          : err instanceof ApiError
            ? err.message
            : 'No se pudo guardar.',
      );
    }
  }

  async function close(status: 'complete' | 'cancel') {
    if (!task) return;
    const outcome = window.prompt(
      status === 'complete' ? 'Resultado de la tarea' : 'Motivo de la cancelación',
    );
    if (!outcome) return;
    try {
      const updated = await apiFetch<TaskDto>(`/renewal-tasks/${task.id}/${status}`, {
        method: 'POST',
        token,
        body: JSON.stringify({ version: task.version, outcome }),
      });
      setTask(updated);
      setMessage(status === 'complete' ? 'Tarea completada.' : 'Tarea cancelada.');
      reload();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo cerrar la tarea.');
    }
  }

  if (!task) return <p>{message ?? 'Cargando tarea…'}</p>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        breadcrumbs={['Gestión', 'Tareas']}
        title={task.title}
        description={`${TASK_TYPE_LABELS[task.taskType]} · ${TASK_STATUS_LABELS[task.status]}`}
      />
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contexto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            Cliente:{' '}
            <Link className="text-link hover:underline" href={`/clients/${task.clientId}`}>
              {client?.legalName ?? task.clientId}
            </Link>
          </p>
          <p>
            Suscripción:{' '}
            {task.subscriptionId ? (
              <Link
                className="text-link hover:underline"
                href={`/subscriptions/${task.subscriptionId}`}
              >
                {subscription ? subscription.product.name : task.subscriptionId}
              </Link>
            ) : (
              '—'
            )}
          </p>
          <p>Origen: {TASK_ORIGIN_LABELS[task.origin]}</p>
          <p>
            Vence: {task.dueDate}
            {task.isOverdue ? ' (vencida)' : ''}
          </p>
          <p>Prioridad: {TASK_PRIORITY_LABELS[task.priority]}</p>
          <p>Responsable: {task.assignee?.fullName ?? 'Sin asignar'}</p>
          {task.outcome ? <p>Resultado: {task.outcome}</p> : null}
        </CardContent>
      </Card>
      {isOpen ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Editar</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                key={`${task.id}-${task.version}`}
                onSubmit={save}
                className="grid gap-4 md:grid-cols-2"
              >
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="task-title">Título</Label>
                  <Input
                    id="task-title"
                    name="title"
                    defaultValue={task.title}
                    required
                    maxLength={200}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="task-status">Estado</Label>
                  <select
                    id="task-status"
                    name="status"
                    defaultValue={task.status}
                    className={selectClassName}
                  >
                    <option value="pending">Pendiente</option>
                    <option value="in_progress">En progreso</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="task-priority">Prioridad</Label>
                  <select
                    id="task-priority"
                    name="priority"
                    defaultValue={task.priority}
                    className={selectClassName}
                  >
                    {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="task-due">Vence</Label>
                  <Input id="task-due" name="dueDate" type="date" defaultValue={task.dueDate} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="task-assignee">Responsable</Label>
                  {isAdmin ? (
                    <select
                      id="task-assignee"
                      name="assigneeUserId"
                      defaultValue={task.assignee?.id ?? ''}
                      className={selectClassName}
                    >
                      <option value="">Sin asignar</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id="task-assignee"
                      name="assigneeUserId"
                      defaultValue={task.assignee?.id ?? ''}
                      placeholder="UUID del responsable (opcional)"
                    />
                  )}
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="task-next-action">Siguiente acción</Label>
                  <Input
                    id="task-next-action"
                    name="nextAction"
                    defaultValue={task.nextAction ?? ''}
                    maxLength={500}
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="task-notes">Notas</Label>
                  <textarea
                    id="task-notes"
                    name="notes"
                    defaultValue={task.notes ?? ''}
                    maxLength={5000}
                    rows={4}
                    className="w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                  />
                </div>
                <div className="flex gap-3 md:col-span-2">
                  <Button type="submit">Guardar cambios</Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button type="button" onClick={() => void close('complete')}>
              Completar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void close('cancel')}>
              Cancelar tarea
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
