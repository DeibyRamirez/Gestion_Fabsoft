import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { me, router } from '@/test/auth-mock';
import { ApiError } from '@/shared/api/client';
import { LoginForm } from './login-form';

const login = vi.fn();
vi.mock('./auth-provider', () => ({ useAuth: () => ({ login }) }));

async function submit(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Contraseña'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    login.mockReset();
    router.replace.mockReset();
  });

  it('permite mostrar y ocultar la contraseña con un botón accesible', async () => {
    render(<LoginForm />);
    const input = screen.getByLabelText('Contraseña');
    expect(input).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('valida en cliente con el esquema compartido', async () => {
    render(<LoginForm />);
    await submit('no-es-email', 'x');
    expect(screen.getByRole('alert')).toHaveTextContent('email y una contraseña válidos');
    expect(login).not.toHaveBeenCalled();
  });

  it.each([
    ['admin', '/dashboard'],
    ['operator', '/dashboard'],
    ['client', '/portal'],
  ] as const)('redirige según el rol %s', async (role, path) => {
    login.mockResolvedValue(
      me({ role, clientId: role === 'client' ? '00000000-0000-4000-8000-000000000201' : null }),
    );
    render(<LoginForm />);
    await submit('u@fabsoft.test', 'secreto');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(path));
  });

  it('con contraseña temporal redirige a /change-password', async () => {
    login.mockResolvedValue(me({ mustChangePassword: true }));
    render(<LoginForm />);
    await submit('u@fabsoft.test', 'secreto');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/change-password'));
  });

  it('muestra error genérico ante 401 y mensaje de espera ante 429', async () => {
    login.mockRejectedValueOnce(new ApiError(401, null));
    render(<LoginForm />);
    await submit('u@fabsoft.test', 'mala');
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
    login.mockRejectedValueOnce(new ApiError(429, null));
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos');
  });
});
