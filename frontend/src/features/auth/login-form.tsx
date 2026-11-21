'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { homePathForRole, LoginInputSchema } from '@fabsoft/shared';
import { ApiError } from '@/shared/api/client';
import { FormField } from '@/shared/components/form-field';
import { PasswordInput } from '@/shared/components/password-input';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
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
          ? 'Demasiados intentos. Espera unos minutos.'
          : 'Credenciales inválidas.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField label="Email" htmlFor="login-email">
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="nombre@ejemplo.com"
          required
        />
      </FormField>
      <FormField label="Contraseña" htmlFor="login-password">
        <PasswordInput
          id="login-password"
          name="password"
          autoComplete="current-password"
          required
        />
      </FormField>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Ingresando…' : 'Ingresar'}
      </Button>
      <p className="text-center text-xs text-fg-muted">
        Acceso según rol asignado por el administrador.
      </p>
    </form>
  );
}
