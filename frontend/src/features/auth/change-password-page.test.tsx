import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { me } from '@/test/auth-mock';
import { ChangePasswordPageView } from './change-password-page';

vi.mock('@/shared/components/auth-page-layout', () => ({
  AuthPageLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-change-password-layout">{children}</div>
  ),
}));

vi.mock('@/shared/components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="internal-shell">{children}</div>
  ),
}));

vi.mock('@/shared/components/portal-shell', () => ({
  PortalShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="portal-shell">{children}</div>
  ),
}));

vi.mock('./change-password-form', () => ({
  ChangePasswordForm: () => <form aria-label="formulario cambio contraseña" />,
}));

const useAuth = vi.fn();
vi.mock('./auth-provider', () => ({ useAuth: () => useAuth() }));

describe('ChangePasswordPageView', () => {
  it('usa layout auth centrado cuando mustChangePassword es true', () => {
    useAuth.mockReturnValue({
      user: me({ mustChangePassword: true }),
      ready: true,
    });
    render(<ChangePasswordPageView />);
    expect(screen.getByTestId('auth-change-password-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('internal-shell')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-shell')).not.toBeInTheDocument();
  });

  it('usa AppShell para cambio voluntario de usuario interno', () => {
    useAuth.mockReturnValue({
      user: me({ role: 'operator', mustChangePassword: false }),
      ready: true,
    });
    render(<ChangePasswordPageView />);
    expect(screen.getByTestId('internal-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-change-password-layout')).not.toBeInTheDocument();
  });

  it('usa PortalShell para cambio voluntario de cliente', () => {
    useAuth.mockReturnValue({
      user: me({
        role: 'client',
        clientId: '00000000-0000-4000-8000-000000000201',
        mustChangePassword: false,
      }),
      ready: true,
    });
    render(<ChangePasswordPageView />);
    expect(screen.getByTestId('portal-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-change-password-layout')).not.toBeInTheDocument();
  });
});
