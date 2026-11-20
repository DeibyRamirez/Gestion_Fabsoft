'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeftIcon, ListChecksIcon } from 'lucide-react';
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
import { PromptDialog, minChars } from '@/shared/components/action-dialog';
import { BentoCard } from '@/shared/components/bento';
import { DetailHero } from '@/shared/components/detail-hero';
import { DetailList } from '@/shared/components/detail-list';
import { FormField } from '@/shared/components/form-field';
import { FormGrid } from '@/shared/components/form-layout';
import { LoadingState } from '@/shared/components/loading-state';
import { SectionHeader } from '@/shared/components/section-header';
import { formatDate } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Textarea } from '@/shared/ui/textarea';
import { useToast } from '@/shared/ui/toast';
import {
  TASK_ORIGIN_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
} from './labels';

export function TaskDetailView({ taskId }: { taskId: string }) {
  const { token, user } = useAuth();
  const [task, setTask] = useState<TaskDto | null>(null);
  const [client, setClient] = useState<ClientDto | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionDetailDto | null>(null);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [closing, setClosing] = useState<'complete' | 'cancel' | null>(null);
  const reload = () => setVersion((v) => v + 1);
  const toast = useToast();
  const isAdmin = user?.role === 'admin';
  const isOpen = task?.status === 'pendiente' || task?.status === 'en_progreso';

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
            apiFetch<UserPage>('/users?pageSize=100&status=activo', { token })
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
      toast('Cambios guardados.');
      reload();
    } catch (err) {
      const errorMessage =
        err instanceof ApiError && err.problem?.code === 'version_conflict'
          ? 'La tarea cambió; recarga e intenta de nuevo.'
          : err instanceof ApiError
            ? err.message
            : 'No se pudo guardar.';
      setMessage(errorMessage);
      toast(errorMessage, 'error');
    }
  }

  async function close(status: 'complete' | 'cancel', outcome: string) {
    if (!task) return;
    try {
      const updated = await apiFetch<TaskDto>(`/renewal-tasks/${task.id}/${status}`, {
        method: 'POST',
        token,
        body: JSON.stringify({ version: task.version, outcome }),
      });
      setTask(updated);
      const okMessage = status === 'complete' ? 'Tarea completada.' : 'Tarea cancelada.';
      setMessage(okMessage);
      toast(okMessage);
      reload();
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'No se pudo cerrar la tarea.';
      setMessage(errorMessage);
      toast(errorMessage, 'error');
    }
  }

  if (!task) {
    return message ? (
      <p role="alert" className="text-sm text-danger">
        {message}
      </p>
    ) : (
      <LoadingState label="Cargando tarea…" />
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <PromptDialog
        open={closing !== null}
        onOpenChange={(o) => {
          if (!o) setClosing(null);
        }}
        title={closing === 'complete' ? 'Completar tarea' : 'Cancelar tarea'}
        submitLabel={closing === 'complete' ? 'Completar' : 'Cancelar tarea'}
        destructive={closing === 'cancel'}
        fields={[
          {
            name: 'outcome',
            label: closing === 'complete' ? 'Resultado de la tarea' : 'Motivo de la cancelación',
            type: 'textarea',
            validate: minChars(2, 'El texto'),
          },
        ]}
        onSubmit={(v) => {
          if (closing) void close(closing, v.outcome ?? '');
        }}
      />

      <DetailHero
        tone="light"
        title={task.title}
        icon={ListChecksIcon}
        badge={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="taskStatus" value={task.status} />
            <StatusBadge kind="taskPriority" value={task.priority} />
          </span>
        }
        meta={
          <>
            {client?.legalName ?? 'Cliente'} · vence {formatDate(task.dueDate)}
            {task.isOverdue ? ' · vencida' : ''}
          </>
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/tasks">
              <ArrowLeftIcon aria-hidden />
              Volver a tareas
            </Link>
          </Button>
        }
      />

      <p role="status" className="sr-only">
        {message}
      </p>

      <div className="grid gap-4 lg:grid-cols-12">
        <BentoCard className="lg:col-span-5">
          <SectionHeader title="Contexto" />
          <DetailList
            className="mt-4"
            columns={1}
            items={[
              {
                label: 'Cliente',
                value: (
                  <Link className="text-link hover:underline" href={`/clients/${task.clientId}`}>
                    {client?.legalName ?? task.clientId}
                  </Link>
                ),
              },
              {
                label: 'Suscripción',
                value: task.subscriptionId ? (
                  <Link
                    className="text-link hover:underline"
                    href={`/subscriptions/${task.subscriptionId}`}
                  >
                    {subscription ? subscription.product.name : 'Ver suscripción'}
                  </Link>
                ) : (
                  '—'
                ),
              },
              { label: 'Tipo', value: TASK_TYPE_LABELS[task.taskType] },
              { label: 'Origen', value: TASK_ORIGIN_LABELS[task.origin] },
              { label: 'Seguimiento', value: TASK_STATUS_LABELS[task.status] },
              { label: 'Prioridad', value: TASK_PRIORITY_LABELS[task.priority] },
              { label: 'Responsable', value: task.assignee?.fullName ?? 'Sin asignar' },
              { label: 'Resultado', value: task.outcome ?? '—' },
            ]}
          />
        </BentoCard>

        <BentoCard className="lg:col-span-7">
          <SectionHeader
            title={isOpen ? 'Editar tarea' : 'Tarea cerrada'}
            description={
              isOpen
                ? 'Actualiza el seguimiento y guarda los cambios.'
                : 'Esta tarea ya no admite edición.'
            }
          />
          {isOpen ? (
            <form key={`${task.id}-${task.version}`} onSubmit={save} className="mt-4">
              <FormGrid>
                <FormField label="Título" htmlFor="task-title" className="md:col-span-2">
                  <Input
                    id="task-title"
                    name="title"
                    defaultValue={task.title}
                    required
                    maxLength={200}
                  />
                </FormField>
                <FormField label="Estado" htmlFor="task-status">
                  <select
                    id="task-status"
                    name="status"
                    defaultValue={task.status}
                    className={nativeSelectClassName}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="en_progreso">En progreso</option>
                  </select>
                </FormField>
                <FormField label="Prioridad" htmlFor="task-priority">
                  <select
                    id="task-priority"
                    name="priority"
                    defaultValue={task.priority}
                    className={nativeSelectClassName}
                  >
                    {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Vence" htmlFor="task-due">
                  <Input id="task-due" name="dueDate" type="date" defaultValue={task.dueDate} />
                </FormField>
                <FormField label="Responsable" htmlFor="task-assignee">
                  {isAdmin ? (
                    <select
                      id="task-assignee"
                      name="assigneeUserId"
                      defaultValue={task.assignee?.id ?? ''}
                      className={nativeSelectClassName}
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
                </FormField>
                <FormField
                  label="Siguiente acción"
                  htmlFor="task-next-action"
                  className="md:col-span-2"
                >
                  <Input
                    id="task-next-action"
                    name="nextAction"
                    defaultValue={task.nextAction ?? ''}
                    maxLength={500}
                  />
                </FormField>
                <FormField label="Notas" htmlFor="task-notes" className="md:col-span-2">
                  <Textarea
                    id="task-notes"
                    name="notes"
                    defaultValue={task.notes ?? ''}
                    maxLength={5000}
                    rows={4}
                  />
                </FormField>
              </FormGrid>
              <div className="mt-5 flex justify-end">
                <Button type="submit">Guardar cambios</Button>
              </div>
            </form>
          ) : (
            <p className="mt-4 text-sm text-fg-muted">
              {task.outcome ? `Resultado: ${task.outcome}` : 'Sin resultado registrado.'}
            </p>
          )}

          {isOpen ? (
            <div className="mt-5 flex flex-wrap gap-3 border-t border-border pt-5">
              <Button type="button" onClick={() => setClosing('complete')}>
                Completar
              </Button>
              <Button type="button" variant="destructive" onClick={() => setClosing('cancel')}>
                Cancelar tarea
              </Button>
            </div>
          ) : null}
        </BentoCard>
      </div>
    </div>
  );
}
