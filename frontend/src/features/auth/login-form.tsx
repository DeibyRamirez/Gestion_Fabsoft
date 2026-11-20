'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { homePathForRole, LoginInputSchema } from '@fabsoft/shared';
import { ApiError } from '@/shared/api/client';
import { FormField } from '@/shared/components/form-field';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useAuth } from './auth-provider';

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
        <div className="relative">
          <Input
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            className="pr-12"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-fg-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
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
