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
import { FormField } from '@/shared/components/form-field';
import { FormActions, FormGrid } from '@/shared/components/form-layout';
import { formatDate } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { Textarea } from '@/shared/ui/textarea';
import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS } from './labels';

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
        ? apiFetch<UserPage>('/users?pageSize=100&status=activo', { token })
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
    <form onSubmit={submit}>
      {message ? (
        <p role="status" className="mb-4 text-sm text-fg-muted">
          {message}
        </p>
      ) : null}
      <FormGrid>
        <FormField label="Título" htmlFor="task-title">
          <Input id="task-title" name="title" required minLength={2} maxLength={200} />
        </FormField>
        <FormField label="Tipo" htmlFor="task-type">
          <select id="task-type" name="taskType" required className={nativeSelectClassName}>
            {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Cliente" htmlFor="task-client">
          <select
            id="task-client"
            name="clientId"
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={nativeSelectClassName}
          >
            <option value="">Seleccione…</option>
            {clients
              .filter((c) => c.status === 'activo')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName}
                </option>
              ))}
          </select>
        </FormField>
        <FormField label="Suscripción (opcional)" htmlFor="task-subscription">
          <select
            id="task-subscription"
            name="subscriptionId"
            className={nativeSelectClassName}
            disabled={!clientId}
          >
            <option value="">Sin suscripción</option>
            {filteredSubscriptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.product.name} · vence {formatDate(s.currentPeriodEnd)}
              </option>
            ))}
          </select>
        </FormField>
        {role === 'admin' ? (
          <FormField label="Responsable" htmlFor="task-assignee">
            <select id="task-assignee" name="assigneeUserId" className={nativeSelectClassName}>
              <option value="">Sin asignar</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
        <FormField label="Prioridad" htmlFor="task-priority">
          <select
            id="task-priority"
            name="priority"
            defaultValue="medium"
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
          <Input id="task-due" name="dueDate" type="date" required />
        </FormField>
        <FormField label="Siguiente acción" htmlFor="task-next-action">
          <Input id="task-next-action" name="nextAction" maxLength={500} />
        </FormField>
        <FormField label="Notas" htmlFor="task-notes" className="md:col-span-2">
          <Textarea id="task-notes" name="notes" maxLength={5000} rows={3} />
        </FormField>
      </FormGrid>
      <FormActions className="mt-5">
        <Button type="submit" disabled={pending}>
          Crear tarea
        </Button>
      </FormActions>
    </form>
  );
}
