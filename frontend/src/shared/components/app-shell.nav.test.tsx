import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { me } from '@/test/auth-mock';
import { AppShell } from '@/shared/components/app-shell';

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({
    user: me({ role: 'admin' }),
    logout: vi.fn(),
  }),
}));

describe('AppShell navigation', () => {
  it('expone los accesos del rol admin como enlaces implementados', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.queryByText(/Próximamente/)).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Panel' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Integraciones' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Usuarios' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /^Clientes$/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /^Suscripciones$/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Solicitudes' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Reglas de alerta' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Configuración' }).length).toBeGreaterThan(0);
  });
});
