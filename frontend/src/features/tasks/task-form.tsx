'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  TaskCreateSchema,
  type ClientDto,
  type SubscriptionPage,
  type TaskDto,
  type UserPage,
} from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS } from './labels';

const selectClassName =
  'flex h-10 w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

type Props = {
  token: string | null;
  role: 'admin' | 'operator' | 'client';
  clients: ClientDto[];
  onCreated?: (task: TaskDto) => void;
};

export function TaskForm({ token, role, clients, onCreated }: Props) {
  const [subscriptions, setSubscriptions] = useState<SubscriptionPage['data']>([]);
  const [users, setUsers] = useState<UserPage['data']>([]);
  const [clientId, setClientId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch<SubscriptionPage>('/subscriptions?pageSize=100', { token }),
      role === 'admin'
        ? apiFetch<UserPage>('/users?pageSize=100&status=active', { token })
        : Promise.resolve<UserPage | null>(null),
    ])
      .then(([subs, userPage]) => {
        if (!alive) return;
        setSubscriptions(subs.data);
        if (userPage) setUsers(userPage.data.filter((u) => u.role !== 'client'));
      })
      .catch(() => {
        if (alive) setMessage('No se pudieron cargar suscripciones o responsables.');
      });
    return () => {
      alive = false;
    };
  }, [token, role]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const parsed = TaskCreateSchema.safeParse({
      taskType: data.get('taskType'),
      title: data.get('title'),
      clientId: data.get('clientId'),
      subscriptionId: data.get('subscriptionId') || null,
      ...(role === 'admin' ? { assigneeUserId: data.get('assigneeUserId') || null } : {}),
      priority: data.get('priority') || 'medium',
      dueDate: data.get('dueDate'),
      notes: data.get('notes') || null,
      nextAction: data.get('nextAction') || null,
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setPending(true);
    try {
      const key =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : String(Date.now());
      const created = await apiFetch<TaskDto>('/renewal-tasks', {
        method: 'POST',
        token,
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify(parsed.data),
      });
      onCreated?.(created);
      form.reset();
      setClientId('');
      setMessage('Tarea creada.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo crear la tarea.');
    } finally {
      setPending(false);
    }
  }

  const filteredSubscriptions = clientId
    ? subscriptions.filter((s) => s.client.id === clientId)
    : subscriptions;

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      {message ? (
        <p role="status" className="text-sm md:col-span-2">
          {message}
        </p>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="task-title">Título</Label>
        <Input id="task-title" name="title" required minLength={2} maxLength={200} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="task-type">Tipo</Label>
        <select id="task-type" name="taskType" required className={selectClassName}>
          {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="task-client">Cliente</Label>
        <select
          id="task-client"
          name="clientId"
          required
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={selectClassName}
        >
          <option value="">Seleccione…</option>
          {clients
            .filter((c) => c.status === 'active')
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.legalName}
              </option>
            ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="task-subscription">Suscripción (opcional)</Label>
        <select
          id="task-subscription"
          name="subscriptionId"
          className={selectClassName}
          disabled={!clientId}
        >
          <option value="">Sin suscripción</option>
          {filteredSubscriptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.product.name} · vence {s.currentPeriodEnd}
            </option>
          ))}
        </select>
      </div>
      {role === 'admin' ? (
        <div className="grid gap-2">
          <Label htmlFor="task-assignee">Responsable</Label>
          <select id="task-assignee" name="assigneeUserId" className={selectClassName}>
            <option value="">Sin asignar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="task-priority">Prioridad</Label>
        <select
          id="task-priority"
          name="priority"
          defaultValue="medium"
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
        <Input id="task-due" name="dueDate" type="date" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="task-next-action">Siguiente acción</Label>
        <Input id="task-next-action" name="nextAction" maxLength={500} />
      </div>
      <div className="grid gap-2 md:col-span-2">
        <Label htmlFor="task-notes">Notas</Label>
        <textarea
          id="task-notes"
          name="notes"
          maxLength={5000}
          rows={3}
          className="w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>
          Crear tarea
        </Button>
      </div>
    </form>
  );
}
