import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ClientForm } from './client-form';

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

describe('ClientForm', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((path: string) =>
      path === '/clients/assignable-owners'
        ? Promise.resolve({
            data: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                fullName: 'Operador',
                role: 'operator',
              },
            ],
          })
        : Promise.resolve({ id: 'c1', legalName: 'Nueva' }),
    );
  });

  it('valida razón social requerida', async () => {
    render(<ClientForm token="t" />);
    fireEvent.submit(screen.getByRole('button', { name: 'Crear cliente' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalledWith('/clients', expect.anything());
  });

  it('envía POST al crear con responsable interno', async () => {
    render(<ClientForm token="t" />);
    fireEvent.change(screen.getByLabelText('Razón social'), { target: { value: 'Nueva SA' } });
    await screen.findByRole('option', { name: 'Operador' });
    fireEvent.change(screen.getByLabelText('Responsable interno'), {
      target: { value: '00000000-0000-4000-8000-000000000001' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Crear cliente' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/clients', expect.anything()));
    expect(fetchMock).toHaveBeenCalledWith(
      '/clients',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"ownerUserId":"00000000-0000-4000-8000-000000000001"'),
      }),
    );
  });
});
