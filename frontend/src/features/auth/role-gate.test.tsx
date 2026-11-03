import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@fabsoft/shared';
import { me, router } from '@/test/auth-mock';
import { RoleGate } from './role-gate';

let state: { user: Me | null; ready: boolean } = { user: null, ready: true };
vi.mock('./auth-provider', () => ({ useAuth: () => state }));

const gate = () =>
  render(
    <RoleGate roles={['admin']}>
      <p>contenido admin</p>
    </RoleGate>,
  );

describe('RoleGate', () => {
  beforeEach(() => router.replace.mockReset());

  it('muestra el contenido al rol permitido', () => {
    state = { user: me(), ready: true };
    gate();
    expect(screen.getByText('contenido admin')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('operador: no ve el contenido y vuelve a su inicio', () => {
    state = { user: me({ role: 'operator' }), ready: true };
    gate();
    expect(screen.queryByText('contenido admin')).not.toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith('/dashboard');
  });

  it('cliente va al portal; sin sesión va a /login; contraseña temporal a /change-password', () => {
    state = {
      user: me({ role: 'client', clientId: '00000000-0000-4000-8000-000000000201' }),
      ready: true,
    };
    gate();
    expect(router.replace).toHaveBeenLastCalledWith('/portal');
    state = { user: null, ready: true };
    gate();
    expect(router.replace).toHaveBeenLastCalledWith('/login');
    state = { user: me({ mustChangePassword: true }), ready: true };
    gate();
    expect(router.replace).toHaveBeenLastCalledWith('/change-password');
    expect(screen.queryByText('contenido admin')).not.toBeInTheDocument();
  });

  it('no redirige mientras la sesión no está lista', () => {
    state = { user: null, ready: false };
    gate();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });
});
