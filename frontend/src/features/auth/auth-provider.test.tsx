import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-provider';

const session = {
  accessToken: 'token',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: {
    id: '00000000-0000-4000-8000-000000000101',
    email: 'admin@fabsoft.test',
    fullName: 'Admin FabSoft',
    role: 'admin',
    clientId: null,
    mustChangePassword: false,
  },
};

function Probe() {
  const { ready, user } = useAuth();
  return <p>{ready ? (user?.email ?? 'sin sesión') : 'cargando'}</p>;
}

describe('AuthProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('hace un único refresh inicial aunque StrictMode duplique el efecto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => session,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <StrictMode>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByText('admin@fabsoft.test')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
