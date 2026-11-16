import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientActivityPage } from '@fabsoft/shared';
import { ActivityPanel } from './activity-panel';

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

const activityPage: ClientActivityPage = {
  data: [
    {
      id: '1',
      occurredAt: '2026-11-16T15:00:00.000Z',
      actor: { id: '00000000-0000-4000-8000-000000000102', name: 'Operador Demo' },
      action: 'subscription.updated',
      resourceType: 'subscription',
      resourceId: '00000000-0000-4000-8000-000000000301',
      summary: 'Suscripción actualizada',
    },
  ],
  meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

describe('ActivityPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('muestra la actividad sin before/after', async () => {
    fetchMock.mockResolvedValue(activityPage);
    render(<ActivityPanel clientId="00000000-0000-4000-8000-000000000302" token="t" />);

    expect(await screen.findByText('Suscripción actualizada')).toBeInTheDocument();
    expect(screen.getByText('Operador Demo')).toBeInTheDocument();
    expect(screen.getByText('subscription.updated')).toBeInTheDocument();
    expect(screen.queryByText('Ver before/after')).toBeNull();
  });
});
