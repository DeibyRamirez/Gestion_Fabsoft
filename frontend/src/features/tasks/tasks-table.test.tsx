import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ClientDto, TaskPage } from '@fabsoft/shared';
import { TasksTable } from './tasks-table';

const client: ClientDto = {
  id: '00000000-0000-4000-8000-000000000101',
  legalName: 'Acme SAS',
  taxId: null,
  status: 'active',
  email: null,
  phone: null,
  owner: null,
  archivedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const page: TaskPage = {
  data: [
    {
      id: '00000000-0000-4000-8000-000000000301',
      taskType: 'contact_client',
      title: 'Llamar al cliente',
      clientId: client.id,
      subscriptionId: null,
      renewalRequestId: null,
      assignee: { id: '00000000-0000-4000-8000-000000000201', fullName: 'Ana Admin' },
      priority: 'high',
      dueDate: '2026-11-18',
      isOverdue: true,
      status: 'pending',
      notes: null,
      nextAction: null,
      outcome: null,
      completedAt: null,
      origin: 'manual',
      version: 1,
      createdAt: '2026-11-17T00:00:00.000Z',
      updatedAt: '2026-11-17T00:00:00.000Z',
    },
  ],
  meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

describe('TasksTable', () => {
  it('muestra tarea, cliente, responsable y vencimiento', () => {
    render(<TasksTable page={page} clients={[client]} />);
    expect(screen.getByRole('link', { name: 'Llamar al cliente' })).toHaveAttribute(
      'href',
      '/tasks/00000000-0000-4000-8000-000000000301',
    );
    expect(screen.getByText('Acme SAS')).toBeInTheDocument();
    expect(screen.getByText('Ana Admin')).toBeInTheDocument();
    expect(screen.getByText('Vencida')).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
  });
});
