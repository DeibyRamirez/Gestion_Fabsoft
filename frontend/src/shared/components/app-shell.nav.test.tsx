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
  it('marca rutas no implementadas como aria-disabled con Próximamente', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const pending = screen.getAllByText('Clientes · Próximamente');
    expect(pending[0]).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Usuarios' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Clientes/ })).not.toBeInTheDocument();
  });
});
