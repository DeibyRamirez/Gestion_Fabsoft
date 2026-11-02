import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { me, router } from '@/test/auth-mock';
import { ChangePasswordForm } from './change-password-form';

const setUser = vi.fn();
const apiFetch = vi.fn();
vi.mock('./auth-provider', () => ({
  useAuth: () => ({ user: me({ mustChangePassword: true }), token: 'tkn', ready: true, setUser }),
}));
vi.mock('@/shared/api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

async function fill(current: string, next: string) {
  await userEvent.type(screen.getByLabelText('Contraseña actual'), current);
  await userEvent.type(screen.getByLabelText('Nueva contraseña'), next);
  await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
}

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    setUser.mockReset();
    router.replace.mockReset();
  });

  it('avisa del cambio obligatorio y rechaza contraseñas cortas sin llamar a la API', async () => {
    render(<ChangePasswordForm />);
    expect(screen.getByText(/contraseña temporal/)).toBeInTheDocument();
    await fill('actual', 'corta');
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 12');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('cambia la contraseña con el token y vuelve al inicio del rol', async () => {
    apiFetch.mockResolvedValue(undefined);
    render(<ChangePasswordForm />);
    await fill('Temporal-123456', 'Nueva-Contraseña-OK');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/dashboard'));
    expect(apiFetch).toHaveBeenCalledWith('/auth/change-password', expect.objectContaining({ method: 'POST', token: 'tkn' }));
    expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ mustChangePassword: false }));
  });

  it('muestra error si la API rechaza', async () => {
    apiFetch.mockRejectedValue(new Error('401'));
    render(<ChangePasswordForm />);
    await fill('Mala-123456789', 'Nueva-Contraseña-OK');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cambiar');
  });
});
