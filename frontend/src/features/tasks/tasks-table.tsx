'use client';

import Link from 'next/link';
import type { ClientDto, TaskDto, TaskPage } from '@fabsoft/shared';
import {
  MobileCard,
  MobileCardList,
  ResponsiveDataView,
} from '@/shared/components/responsive-data-view';
import { formatDate } from '@/shared/lib/format';
import { StatusBadge, ToneBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { TASK_ORIGIN_LABELS } from './labels';

export function TasksTable({ page, clients }: { page: TaskPage; clients: ClientDto[] }) {
  const byId = new Map(clients.map((c) => [c.id, c]));

  const desktop = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tarea</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Vence</TableHead>
          <TableHead>Prioridad</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Responsable</TableHead>
          <TableHead>Origen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.data.map((task: TaskDto) => (
          <TableRow key={task.id}>
            <TableCell>
              <Link
                className="font-semibold text-fg hover:text-link hover:underline"
                href={`/tasks/${task.id}`}
              >
                {task.title}
              </Link>
            </TableCell>
            <TableCell className="text-fg-muted">
              {byId.get(task.clientId)?.legalName ?? '—'}
            </TableCell>
            <TableCell>
              <span className="block text-sm">{formatDate(task.dueDate)}</span>
              {task.isOverdue ? (
                <ToneBadge tone="danger" className="mt-1">
                  Vencida
                </ToneBadge>
              ) : null}
            </TableCell>
            <TableCell>
              <StatusBadge kind="taskPriority" value={task.priority} />
            </TableCell>
            <TableCell>
              <StatusBadge kind="taskStatus" value={task.status} />
            </TableCell>
            <TableCell className="text-fg-muted">
              {task.assignee?.fullName ?? 'Sin asignar'}
            </TableCell>
            <TableCell className="text-xs text-fg-muted">
              {TASK_ORIGIN_LABELS[task.origin]}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const mobile = (
    <MobileCardList>
      {page.data.map((task: TaskDto) => (
        <MobileCard key={task.id}>
          <div className="flex items-start justify-between gap-2">
            <Link
              className="min-w-0 font-semibold text-fg hover:text-link hover:underline"
              href={`/tasks/${task.id}`}
            >
              {task.title}
            </Link>
            <StatusBadge kind="taskPriority" value={task.priority} />
          </div>
          <p className="text-xs text-fg-muted">
            {byId.get(task.clientId)?.legalName ?? '—'} · vence {formatDate(task.dueDate)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge kind="taskStatus" value={task.status} />
            {task.isOverdue ? <ToneBadge tone="danger">Vencida</ToneBadge> : null}
            <span className="ml-auto text-xs text-fg-muted">
              {task.assignee?.fullName ?? 'Sin asignar'}
            </span>
          </div>
        </MobileCard>
      ))}
    </MobileCardList>
  );

  return <ResponsiveDataView desktop={desktop} mobile={mobile} />;
}
