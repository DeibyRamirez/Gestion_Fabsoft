import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditLogDto, AuditLogPage } from '@fabsoft/shared';
import { AuditLogsPage } from './audit-logs-page';

const fetchMock = vi.fn();

vi.mock('@/shared/api/client', () => ({
  apiFetch: (...args: unknown[]) => fetchMock(...args),
  ApiError: class ApiError extends Error {
    problem?: { code?: string } | undefined;
    constructor(msg: string, problem?: { code?: string } | undefined) {
      super(msg);
      this.problem = problem;
    }
  },
}));

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({
    token: 't',
    user: {
      id: '00000000-0000-4000-8000-000000000101',
      email: 'admin@fabsoft.test',
      fullName: 'Admin',
      role: 'admin',
      clientId: null,
      mustChangePassword: false,
    },
    ready: true,
    login: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
}));

const log: AuditLogDto = {
  id: '1',
  occurredAt: '2026-11-16T15:00:00.000Z',
  actorType: 'user',
  actor: { id: '00000000-0000-4000-8000-000000000102', name: 'Operador Demo' },
  action: 'subscription.updated',
  resourceType: 'subscription',
  resourceId: '00000000-0000-4000-8000-000000000301',
  clientId: '00000000-0000-4000-8000-000000000302',
  changes: {
    before: { notes: null },
    after: { notes: 'seguimiento' },
  },
  reason: null,
  requestId: 'req-1',
};

const auditPage: AuditLogPage = {
  data: [log],
  meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

const emptyPage: AuditLogPage = {
  data: [],
  meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

describe('AuditLogsPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('muestra el evento con before/after y actor', async () => {
    fetchMock.mockResolvedValue(auditPage);
    render(<AuditLogsPage />);

    expect(await screen.findByText('Operador Demo')).toBeInTheDocument();
    expect(screen.getByText('subscription.updated')).toBeInTheDocument();
    expect(screen.getByText('Ver before/after')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Ver before/after'));
    expect(screen.getByText(/seguimiento/)).toBeInTheDocument();
  });

  it('aplica el filtro de acción', async () => {
    fetchMock.mockResolvedValue(auditPage);
    render(<AuditLogsPage />);

    await screen.findByText('Operador Demo');
    fireEvent.change(screen.getByLabelText('Acción'), {
      target: { value: 'subscription.updated' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('action=subscription.updated'),
      );
      expect(call).toBeTruthy();
    });
  });

  it('muestra el estado vacío', async () => {
    fetchMock.mockResolvedValue(emptyPage);
    render(<AuditLogsPage />);

    expect(
      await screen.findByText('Sin eventos de auditoría para los filtros.'),
    ).toBeInTheDocument();
  });
});
