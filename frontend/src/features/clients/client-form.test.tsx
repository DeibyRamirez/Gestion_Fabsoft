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
  beforeEach(() => fetchMock.mockReset());

  it('valida razón social requerida', async () => {
    render(<ClientForm token="t" />);
    fireEvent.submit(screen.getByRole('button', { name: 'Crear cliente' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envía POST al crear', async () => {
    fetchMock.mockResolvedValue({ id: 'c1', legalName: 'Nueva' });
    render(<ClientForm token="t" />);
    fireEvent.change(screen.getByLabelText('Razón social'), { target: { value: 'Nueva SA' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Crear cliente' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/clients');
  });
});
