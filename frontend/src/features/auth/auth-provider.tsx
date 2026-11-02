'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { TokenResponseSchema, type LoginInput, type Me } from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';

interface AuthState {
  user: Me | null;
  token: string | null;
  ready: boolean;
  login(input: LoginInput): Promise<Me>;
  logout(): Promise<void>;
  setUser(user: Me): void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Access token sólo en memoria (ADR-001); al cargar se intenta un refresh con la cookie. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const applySession = useCallback((raw: unknown) => {
    const session = TokenResponseSchema.parse(raw);
    setToken(session.accessToken);
    setUser(session.user);
    return session;
  }, []);

  const refresh = useCallback(async () => {
    try {
      return applySession(await apiFetch('/auth/refresh', { method: 'POST' }));
    } catch {
      setToken(null);
      setUser(null);
      return null;
    }
  }, [applySession]);

  useEffect(() => {
    let alive = true;
    apiFetch('/auth/refresh', { method: 'POST' })
      .then((raw) => alive && applySession(raw))
      .catch(() => undefined)
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [applySession]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => void refresh(), 12 * 60 * 1000);
    return () => clearInterval(id);
  }, [token, refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      ready,
      login: async (input) =>
        applySession(await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(input) }))
          .user,
      logout: async () => {
        await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
        setToken(null);
        setUser(null);
      },
      setUser,
    }),
    [user, token, ready, applySession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
