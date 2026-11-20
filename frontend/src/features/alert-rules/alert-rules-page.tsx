'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertRuleUpdateSchema,
  type AlertRuleDto,
  type AlertRuleList,
  type NotificationChannel,
  type TaskPriority,
  type TaskType,
} from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { NOTIFICATION_CHANNEL_LABELS } from '@/shared/lib/labels';
import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS } from '@/features/tasks/labels';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const CHANNEL_LABELS = NOTIFICATION_CHANNEL_LABELS;

const offsetLabel = (days: number): string => {
  if (days > 0) return `${days} días antes`;
  if (days === 0) return 'El día del vencimiento';
  return `${Math.abs(days)} día(s) después`;
};

const toggleChannel = (channels: NotificationChannel[], channel: NotificationChannel) =>
  channels.includes(channel) ? channels.filter((item) => item !== channel) : [...channels, channel];

export function AlertRulesPage() {
  const { token } = useAuth();
  const [rules, setRules] = useState<AlertRuleDto[]>([]);
  const [draft, setDraft] = useState<AlertRuleDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    apiFetch<AlertRuleList>('/alert-rules', { token })
      .then((result) => {
        if (alive) setRules(result.data);
      })
      .catch(() => {
        if (alive) setMessage('No se pudieron cargar las reglas de alerta.');
      });
    return () => {
      alive = false;
    };
  }, [token, version]);

  function startEdit(rule: AlertRuleDto) {
    setDraft({ ...rule, channels: [...rule.channels] });
    setMessage(null);
  }

  function updateDraft(patch: Partial<AlertRuleDto>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function save() {
    if (!draft) return;
    const parsed = AlertRuleUpdateSchema.safeParse({
      description: draft.description,
      offsetDays: draft.offsetDays,
      channels: draft.channels,
      createsTask: draft.createsTask,
      taskType: draft.createsTask ? draft.taskType : null,
      taskPriority: draft.createsTask ? draft.taskPriority : null,
      appliesWhenNotRenewable: draft.appliesWhenNotRenewable,
      isActive: draft.isActive,
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      await apiFetch<AlertRuleDto>(`/alert-rules/${draft.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(parsed.data),
      });
      setMessage(
        'Regla actualizada. Se aplicará en la próxima reconciliación diaria (00:10 Bogotá).',
      );
      setDraft(null);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setMessage('Ya existe otra regla con ese umbral. Usa días distintos.');
      } else {
        setMessage(err instanceof ApiError ? err.message : 'No se pudo actualizar la regla.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <PageHeader
        title="Reglas de alerta"
        description="Umbrales globales que usa el worker para programar alertas y tareas. La plantilla de correo es fija."
      />

      {message ? (
        <div role="status" className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
          {message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Política de alertas</CardTitle>
          <CardDescription>
            Los cambios se aplican en la próxima reconciliación diaria (00:10 Bogotá). El código de
            la regla no cambia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Umbral</TableHead>
                <TableHead>Canales</TableHead>
                <TableHead>Tarea</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono text-xs">{rule.code}</TableCell>
                  <TableCell>{rule.description}</TableCell>
                  <TableCell>{offsetLabel(rule.offsetDays)}</TableCell>
                  <TableCell>{rule.channels.map((c) => CHANNEL_LABELS[c]).join(', ')}</TableCell>
                  <TableCell>{rule.createsTask ? 'Sí' : 'No'}</TableCell>
                  <TableCell>{rule.isActive ? 'Activa' : 'Inactiva'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(rule)}
                    >
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>No hay reglas configuradas.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {draft ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Editar {draft.code}</CardTitle>
            <CardDescription>
              El umbral positivo indica días antes; 0 es el día del vencimiento; negativo, días
              después.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="alert-rule-description">Descripción</Label>
              <Input
                id="alert-rule-description"
                value={draft.description}
                minLength={3}
                maxLength={200}
                onChange={(e) => updateDraft({ description: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="alert-rule-offset">Días de anticipación</Label>
              <Input
                id="alert-rule-offset"
                type="number"
                min={-90}
                max={365}
                value={draft.offsetDays}
                onChange={(e) => updateDraft({ offsetDays: Number(e.target.value) })}
              />
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Canales</legend>
              <div className="flex flex-wrap gap-4">
                {(['in_app', 'email'] as const).map((channel) => (
                  <label key={channel} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-border-input accent-[var(--color-iris)]"
                      checked={draft.channels.includes(channel)}
                      onChange={() =>
                        updateDraft({ channels: toggleChannel(draft.channels, channel) })
                      }
                    />
                    {CHANNEL_LABELS[channel]}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-border-input accent-[var(--color-iris)]"
                checked={draft.createsTask}
                onChange={(e) =>
                  updateDraft(
                    e.target.checked
                      ? {
                          createsTask: true,
                          taskType: draft.taskType ?? 'contact_client',
                          taskPriority: draft.taskPriority ?? 'medium',
                        }
                      : { createsTask: false, taskType: null, taskPriority: null },
                  )
                }
              />
              Crea una tarea automática
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-border-input accent-[var(--color-iris)]"
                checked={draft.appliesWhenNotRenewable}
                onChange={(e) => updateDraft({ appliesWhenNotRenewable: e.target.checked })}
              />
              Aplica aunque la suscripción no sea renovable (excepción RN-10)
            </label>

            {draft.createsTask ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="alert-rule-task-type">Tipo de tarea</Label>
                  <select
                    id="alert-rule-task-type"
                    className={nativeSelectClassName}
                    value={draft.taskType ?? 'contact_client'}
                    onChange={(e) => updateDraft({ taskType: e.target.value as TaskType })}
                  >
                    {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="alert-rule-task-priority">Prioridad de la tarea</Label>
                  <select
                    id="alert-rule-task-priority"
                    className={nativeSelectClassName}
                    value={draft.taskPriority ?? 'medium'}
                    onChange={(e) => updateDraft({ taskPriority: e.target.value as TaskPriority })}
                  >
                    {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-border-input accent-[var(--color-iris)]"
                checked={draft.isActive}
                onChange={(e) => updateDraft({ isActive: e.target.checked })}
              />
              Regla activa
            </label>

            <div className="flex gap-3 md:col-span-2">
              <Button type="button" onClick={save} disabled={pending}>
                {pending ? 'Guardando…' : 'Guardar cambios'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
