import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '@fabsoft/shared';
import { SettingsPage } from './settings-page';

const fetchMock = vi.fn();

vi.mock('@/shared/api/client', () => ({
  apiFetch: (...args: unknown[]) => fetchMock(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ token: 't' }),
}));

const settings: Settings = {
  contactChannel: {
    email: 'contacto@fabsoft.test',
    phone: '+57 300 000 0000',
    hours: 'Lunes a viernes, 8:00-17:00',
  },
};

describe('SettingsPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('carga el canal de contacto y guarda los cambios', async () => {
    const updated: Settings = {
      contactChannel: {
        email: 'soporte@fabsoft.test',
        phone: '+57 300 123 4567',
        hours: 'Lunes a viernes, 8:00-17:00',
      },
    };
    fetchMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/settings' && init?.method === 'PATCH') return Promise.resolve(updated);
      return Promise.resolve(settings);
    });

    render(<SettingsPage />);

    expect(await screen.findByDisplayValue('contacto@fabsoft.test')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Correo de contacto'), {
      target: { value: 'soporte@fabsoft.test' },
    });
    fireEvent.change(screen.getByLabelText('Teléfono'), {
      target: { value: '+57 300 123 4567' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    const patchCall = fetchMock.mock.calls.find(
      ([path, init]) =>
        path === '/settings' && (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(JSON.parse(String((patchCall?.[1] as RequestInit).body))).toEqual(updated);
    expect(await screen.findByText(/Configuración guardada/)).toBeInTheDocument();
  });

  it('envía null al limpiar los campos', async () => {
    fetchMock.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/settings' && init?.method === 'PATCH') {
        return Promise.resolve({ contactChannel: { email: null, phone: null, hours: null } });
      }
      return Promise.resolve(settings);
    });

    render(<SettingsPage />);

    await screen.findByDisplayValue('contacto@fabsoft.test');
    fireEvent.change(screen.getByLabelText('Correo de contacto'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Horario de atención'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    const patchCall = fetchMock.mock.calls.find(
      ([path, init]) =>
        path === '/settings' && (init as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(JSON.parse(String((patchCall?.[1] as RequestInit).body))).toEqual({
      contactChannel: { email: null, phone: null, hours: null },
    });
  });

  it('valida el correo antes de llamar al API', async () => {
    fetchMock.mockResolvedValue(settings);

    render(<SettingsPage />);

    await screen.findByDisplayValue('contacto@fabsoft.test');
    fireEvent.change(screen.getByLabelText('Correo de contacto'), {
      target: { value: 'no-es-correo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    expect(await screen.findByText('Correo inválido')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('muestra un error si no puede cargar la configuración', async () => {
    fetchMock.mockRejectedValue(new Error('network'));

    render(<SettingsPage />);

    expect(await screen.findByText('No se pudo cargar la configuración.')).toBeInTheDocument();
  });
});
