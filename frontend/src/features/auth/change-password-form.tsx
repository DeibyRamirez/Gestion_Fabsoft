'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ChangePasswordInputSchema, homePathForRole, PASSWORD_MIN_LENGTH } from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';
import { useAuth } from './auth-provider';

export function ChangePasswordForm() {
  const { user, token, ready, setUser } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const parsed = ChangePasswordInputSchema.safeParse({
      currentPassword: data.get('currentPassword'),
      newPassword: data.get('newPassword'),
    });
    if (!parsed.success)
      return setError(`La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        token,
        body: JSON.stringify(parsed.data),
      });
      if (user) {
        setUser({ ...user, mustChangePassword: false });
        router.replace(homePathForRole(user.role));
      }
    } catch {
      setError(
        'No se pudo cambiar la contraseña. Verifica la actual y que la nueva no sea tu email.',
      );
    }
  }

  if (!user) return <p aria-busy="true">Cargando…</p>;
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, maxWidth: 360 }}>
      {user.mustChangePassword && <p>Debes cambiar tu contraseña temporal para continuar.</p>}
      <label>
        Contraseña actual
        <input name="currentPassword" type="password" autoComplete="current-password" required />
      </label>
      <label>
        Nueva contraseña
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">Cambiar contraseña</button>
    </form>
  );
}
