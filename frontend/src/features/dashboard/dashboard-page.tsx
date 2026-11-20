'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  DashboardActivity,
  DashboardSummary,
  NotificationPage,
  TaskDto,
  TaskPage,
} from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { KpiCard } from './kpi-card';

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(value));

const actionLabel = (action: string): string => {
  const labels: Record<string, string> = {
    'client.created': 'Cliente creado',
    'client.updated': 'Cliente actualizado',
    'client.archived': 'Cliente archivado',
    'subscription.created': 'Suscripción creada',
    'subscription.updated': 'Suscripción actualizada',
    'subscription.activated': 'Suscripción activada',
    'subscription.renewed': 'Suscripción renovada',
    'subscription.not_renewed': 'Suscripción no renovada',
    'subscription.cancelled': 'Suscripción cancelada',
    'subscription.expiration_corrected': 'Vencimiento corregido',
    'task.completed': 'Tarea completada',
    'task.cancelled': 'Tarea cancelada',
    'alert_rule.updated': 'Regla de alerta actualizada',
    'notification.retried': 'Alerta reintentada',
  };
  return labels[action] ?? action;
};

export function DashboardPage() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<DashboardActivity['data']>([]);
  const [todayTasks, setTodayTasks] = useState<TaskDto[]>([]);
  const [failedAlerts, setFailedAlerts] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch<DashboardSummary>('/dashboard/summary', { token }),
      apiFetch<DashboardActivity>('/dashboard/activity?limit=8', { token }),
    ])
      .then(([summaryData, activityData]) => {
        if (!alive) return;
        setSummary(summaryData);
        setActivity(activityData.data);
        setMessage(null);
      })
      .catch(() => {
        if (alive) setMessage('No se pudieron cargar los indicadores del panel.');
      });
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!summary) return;
    let alive = true;
    const params = new URLSearchParams({
      assigneeUserId: 'me',
      status: 'pending,in_progress',
      dueFrom: summary.today,
      dueTo: summary.today,
      pageSize: '5',
      sort: 'dueDate',
    });
    Promise.all([
      apiFetch<TaskPage>(`/renewal-tasks?${params.toString()}`, { token }),
      apiFetch<NotificationPage>('/notifications?status=failed&pageSize=1', { token }),
    ])
      .then(([tasks, notifications]) => {
        if (!alive) return;
        setTodayTasks(tasks.data);
        setFailedAlerts(notifications.meta.total);
      })
      .catch(() => {
        if (alive) setTodayTasks([]);
      });
    return () => {
      alive = false;
    };
  }, [summary, token]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <PageHeader
        breadcrumbs={['Gestión']}
        title="Panel"
        description="Qué requiere atención hoy: vencimientos, seguimiento y tareas abiertas."
      />

      {message ? (
        <div role="status" className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
          {message}
        </div>
      ) : null}

      {failedAlerts > 0 ? (
        <div
          role="status"
          className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-fg"
        >
          Hay {failedAlerts} alerta(s) con envío fallido.{' '}
          <Link className="text-link underline" href="/notifications?status=failed">
            Revisar alertas
          </Link>
        </div>
      ) : null}

      {summary ? (
        <section aria-labelledby="kpi-title" className="flex flex-col gap-4">
          <h2 id="kpi-title" className="text-lg font-semibold text-fg">
            Indicadores
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard label="Suscripciones activas" indicator={summary.activeSubscriptions} />
            <KpiCard label="Vencen en 30 días" indicator={summary.expiringIn30Days} />
            <KpiCard label="Vencen en 15 días" indicator={summary.expiringIn15Days} />
            <KpiCard label="Vencen en 7 días" indicator={summary.expiringIn7Days} />
            <KpiCard label="Suscripciones vencidas" indicator={summary.expiredSubscriptions} />
            <KpiCard
              label="Renovaciones pendientes de respuesta"
              indicator={summary.renewalsPendingResponse}
            />
            <KpiCard label="Tareas vencidas" indicator={summary.overdueTasks} />
            <KpiCard label="Tareas próximas" indicator={summary.upcomingTasks} />
            <KpiCard label="Solicitudes nuevas" indicator={summary.newRenewalRequests} />
          </div>
        </section>
      ) : (
        <p aria-busy="true">Cargando indicadores…</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mis tareas de hoy</CardTitle>
          </CardHeader>
          <CardContent>
            {todayTasks.length === 0 ? (
              <p className="text-sm text-fg-muted">No tienes tareas para hoy.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {todayTasks.map((task) => (
                  <li key={task.id} className="flex items-start justify-between gap-3">
                    <div>
                      <Link className="text-sm font-medium text-link hover:underline" href={`/tasks/${task.id}`}>
                        {task.title}
                      </Link>
                      <p className="text-xs text-fg-muted">
                        {task.priority} · vence {task.dueDate}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-fg-muted">Sin actividad reciente.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {activity.map((event) => (
                  <li key={event.id} className="flex flex-col gap-0.5">
                    <span className="text-sm text-fg">{actionLabel(event.action)}</span>
                    <span className="text-xs text-fg-muted">
                      {event.actor?.name ?? 'Sistema'} · {formatDateTime(event.occurredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
