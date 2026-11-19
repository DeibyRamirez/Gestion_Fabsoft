'use client';

import Link from 'next/link';
import type { ClientDto, TaskDto, TaskPage } from '@fabsoft/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { TASK_ORIGIN_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from './labels';

export function TasksTable({ page, clients }: { page: TaskPage; clients: ClientDto[] }) {
  const byId = new Map(clients.map((c) => [c.id, c]));

  return (
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
        {page.data.map((t: TaskDto) => (
          <TableRow key={t.id}>
            <TableCell>
              <Link className="text-link hover:underline" href={`/tasks/${t.id}`}>
                {t.title}
              </Link>
            </TableCell>
            <TableCell>{byId.get(t.clientId)?.legalName ?? '—'}</TableCell>
            <TableCell>
              {t.dueDate}
              {t.isOverdue ? (
                <span className="ml-2 text-xs font-medium text-danger">Vencida</span>
              ) : null}
            </TableCell>
            <TableCell>{TASK_PRIORITY_LABELS[t.priority]}</TableCell>
            <TableCell>{TASK_STATUS_LABELS[t.status]}</TableCell>
            <TableCell>{t.assignee?.fullName ?? 'Sin asignar'}</TableCell>
            <TableCell>{TASK_ORIGIN_LABELS[t.origin]}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
