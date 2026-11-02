'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { homePathForRole, LoginInputSchema } from '@fabsoft/shared';
import { ApiError } from '@/shared/api/client';
import { useAuth } from './auth-provider';

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const parsed = LoginInputSchema.safeParse({
      email: data.get('email'),
      password: data.get('password'),
    });
    if (!parsed.success) return setError('Ingresa un email y una contraseña válidos.');
    setBusy(true);
    setError(null);
    try {
      const user = await login(parsed.data);
      router.replace(user.mustChangePassword ? '/change-password' : homePathForRole(user.role));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Demasiados intentos. Espera un minuto.'
          : 'Credenciales inválidas.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
      <label>
        Email
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        Contraseña
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Ingresando…' : 'Ingresar'}
      </button>
    </form>
  );
}
