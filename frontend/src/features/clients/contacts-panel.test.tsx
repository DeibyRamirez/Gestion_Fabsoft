import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactsPanel } from './contacts-panel';

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

const contact = {
  id: 'ct-1',
  clientId: 'c1',
  fullName: 'Ana Pérez',
  email: 'ana@acme.test',
  phone: null,
  roleTitle: null,
  isPrimary: true,
  archivedAt: null,
};

describe('ContactsPanel', () => {
  beforeEach(() => fetchMock.mockReset());

  it('lista contactos y marca el principal', async () => {
    fetchMock.mockResolvedValue({ data: [contact] });
    render(<ContactsPanel clientId="c1" token="t" />);
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getAllByText('Principal').some((el) => el.tagName === 'SPAN')).toBe(true);
  });

  it('no guarda un contacto sin email ni teléfono', async () => {
    fetchMock.mockResolvedValue({ data: [] });
    render(<ContactsPanel clientId="c1" token="t" />);
    await screen.findByText('Sin contactos registrados.');
    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Sin canal' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Agregar contacto' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(fetchMock.mock.calls.some((c) => (c[1] as { method?: string })?.method === 'POST')).toBe(
      false,
    );
  });

  it('envía POST al agregar un contacto', async () => {
    fetchMock.mockResolvedValue({ data: [] });
    render(<ContactsPanel clientId="c1" token="t" />);
    await screen.findByText('Sin contactos registrados.');
    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Luis Gómez' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'luis@acme.test' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Agregar contacto' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((c) => (c[1] as { method?: string })?.method === 'POST'),
      ).toBe(true),
    );
  });
});
