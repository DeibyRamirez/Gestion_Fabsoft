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
import {
  AlertOctagonIcon,
  CalendarClockIcon,
  ClockAlertIcon,
  HourglassIcon,
  InboxIcon,
  RepeatIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { ActivityFeed } from '@/shared/components/activity-feed';
import { NebulaStat, UrgentCard } from '@/shared/components/bento';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadingState } from '@/shared/components/loading-state';
import { PageHeader } from '@/shared/components/page-header';
import { SectionHeader } from '@/shared/components/section-header';
import { formatDate } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { StatusBadge } from '@/shared/ui/status-badge';
import { indicatorHref, KpiCard } from './kpi-card';

function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/Bogota',
    }).format(new Date()),
  );
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function DashboardPage() {
  const { token, user } = useAuth();
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
      status: 'pendiente,en_progreso',
      dueFrom: summary.today,
      dueTo: summary.today,
      pageSize: '5',
      sort: 'dueDate',
    });
    Promise.all([
      apiFetch<TaskPage>(`/renewal-tasks?${params.toString()}`, { token }),
      apiFetch<NotificationPage>('/notifications?status=fallida&pageSize=1', { token }),
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

  const firstName = user?.fullName.split(/\s+/)[0] ?? '';

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        title="Panel"
        description="Qué requiere atención hoy: vencimientos, seguimiento y tareas abiertas."
        className="sr-only"
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-3xl leading-tight font-extrabold tracking-tight text-fg lg:text-4xl">
          {greeting()}
          {firstName ? `, ${firstName}.` : '.'}{' '}
          <span className="font-serif font-normal text-iris italic">esto pide atención hoy.</span>
        </p>
        <Button asChild>
          <Link href="/subscriptions/new">Nueva suscripción</Link>
        </Button>
      </div>

      {message ? (
        <div role="status" className="rounded-2xl bg-surface px-4 py-3 text-sm shadow-card">
          {message}
        </div>
      ) : null}

      {failedAlerts > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-2xl bg-status-expired-bg px-4 py-3 text-sm font-medium text-status-expired-fg"
        >
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
          <span>Hay {failedAlerts} alerta(s) con envío fallido.</span>
          <Link
            className="ml-auto font-bold underline underline-offset-4"
            href="/notifications?status=fallida"
          >
            Revisar alertas
          </Link>
        </div>
      ) : null}

      {summary ? (
        <section aria-labelledby="kpi-title" className="grid gap-4 lg:grid-cols-12">
          <h2 id="kpi-title" className="sr-only">
            Indicadores
          </h2>
          {/* Los conteos 30/15/7 son ACUMULADOS (hoy → hoy+N). No restar entre ellos. */}
          <UrgentCard className="lg:col-span-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white/85">Vencimientos próximos</p>
                <p className="font-serif text-xl italic">los próximos 30 días</p>
              </div>
              <Link
                href={indicatorHref(summary.expiringIn30Days)}
                className="grid h-8 place-items-center rounded-full border border-white/20 bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/15"
              >
                Ver lista →
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-end gap-8">
              <NebulaStat
                href={indicatorHref(summary.expiringIn30Days)}
                value={summary.expiringIn30Days.count}
                label="Vencen en 30 días"
                size="xl"
              />
              <NebulaStat
                href={indicatorHref(summary.expiringIn15Days)}
                value={summary.expiringIn15Days.count}
                label="Vencen en 15 días"
                tone="amber"
              />
              <NebulaStat
                href={indicatorHref(summary.expiringIn7Days)}
                value={summary.expiringIn7Days.count}
                label="Vencen en 7 días"
                tone="rose"
              />
            </div>
          </UrgentCard>

          <div className="flex flex-col gap-3 lg:col-span-5">
            <KpiCard
              label="Suscripciones activas"
              indicator={summary.activeSubscriptions}
              icon={RepeatIcon}
              tone="success"
              size="large"
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KpiCard
                label="Suscripciones vencidas"
                indicator={summary.expiredSubscriptions}
                icon={AlertOctagonIcon}
                tone="danger"
              />
              <KpiCard
                label="Renovaciones pendientes de respuesta"
                indicator={summary.renewalsPendingResponse}
                icon={HourglassIcon}
                tone="soon"
              />
              <KpiCard
                label="Tareas vencidas"
                indicator={summary.overdueTasks}
                icon={ClockAlertIcon}
                tone="danger"
              />
              <KpiCard
                label="Tareas próximas"
                indicator={summary.upcomingTasks}
                icon={CalendarClockIcon}
                tone="info"
              />
              <KpiCard
                className="col-span-2"
                label="Solicitudes nuevas"
                indicator={summary.newRenewalRequests}
                icon={InboxIcon}
                tone="violet"
              />
            </div>
          </div>
        </section>
      ) : (
        <LoadingState label="Cargando indicadores…" />
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="rounded-xl border border-border bg-surface p-5 shadow-card lg:col-span-7 md:p-6">
          <SectionHeader
            title="Mis tareas de hoy"
            action={
              <Link href="/tasks" className="text-sm font-semibold text-link hover:underline">
                Ver todas
              </Link>
            }
          />
          {todayTasks.length === 0 ? (
            <EmptyState
              icon={CalendarClockIcon}
              title="No tienes tareas para hoy."
              className="mt-4"
            />
          ) : (
            <ul className="mt-2 flex flex-col">
              {todayTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-3 border-t border-border py-3 first:border-0"
                >
                  <span
                    aria-hidden
                    className="size-5 shrink-0 rounded-md border-2 border-border-input/40"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      className="block truncate text-sm font-semibold text-fg hover:text-link hover:underline"
                      href={`/tasks/${task.id}`}
                    >
                      {task.title}
                    </Link>
                    <p className="text-xs text-fg-muted">vence {formatDate(task.dueDate)}</p>
                  </div>
                  <StatusBadge kind="taskPriority" value={task.priority} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-card lg:col-span-5 md:p-6">
          <SectionHeader
            title="Actividad reciente"
            action={<span className="text-xs text-fg-muted">hoy</span>}
          />
          <ActivityFeed className="mt-2" items={activity} empty="Sin actividad reciente." />
        </section>
      </div>
    </div>
  );
}
