'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ChangePasswordInputSchema, homePathForRole, PASSWORD_MIN_LENGTH } from '@fabsoft/shared';
import { apiFetch } from '@/shared/api/client';
import { FormField } from '@/shared/components/form-field';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useAuth } from './auth-provider';

export function ChangePasswordForm() {
  const { user, token, ready, setUser } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    setError(null);
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
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <p aria-busy="true">Cargando…</p>;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {user.mustChangePassword ? (
        <div
          role="status"
          className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-fg"
        >
          Debes cambiar tu contraseña temporal para continuar.
        </div>
      ) : null}
      <FormField label="Contraseña actual" htmlFor="current-password">
        <Input
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </FormField>
      <FormField
        label="Nueva contraseña"
        htmlFor="new-password"
        hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}
      >
        <Input
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
      </FormField>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Guardando…' : 'Cambiar contraseña'}
      </Button>
    </form>
  );
}
