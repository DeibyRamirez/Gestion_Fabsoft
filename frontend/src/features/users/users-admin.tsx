'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  USER_ROLES,
  UserCreateSchema,
  type UserCreatedDto,
  type UserDto,
  type UserPage,
  type UserRole,
} from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

const selectClassName =
  'flex h-10 w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/** Gestión de usuarios (sólo admin; la API devuelve 403 a otros roles). */
export function UsersAdmin() {
  const { token, user: me } = useAuth();
  const [page, setPage] = useState<UserPage | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    apiFetch<UserPage>('/users?pageSize=100', { token })
      .then((p) => alive && setPage(p))
      .catch(() => alive && setMessage('No se pudo cargar la lista de usuarios.'));
    return () => {
      alive = false;
    };
  }, [token, version]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const role = data.get('role') as UserRole;
    const parsed = UserCreateSchema.safeParse({
      email: data.get('email'),
      fullName: data.get('fullName'),
      role,
      clientId: role === 'client' ? data.get('clientId') || null : null,
    });
    if (!parsed.success) return setMessage(parsed.error.issues[0]?.message ?? 'Datos inválidos');
    try {
      const created = await apiFetch<UserCreatedDto>('/users', {
        method: 'POST',
        token,
        body: JSON.stringify(parsed.data),
      });
      setMessage(
        `Usuario creado. Contraseña temporal (se muestra una sola vez): ${created.temporaryPassword}`,
      );
      form.reset();
      load();
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.problem?.code === 'duplicate_email'
          ? 'Ese email ya existe.'
          : 'No se pudo crear el usuario.',
      );
    }
  }

  async function patch(u: UserDto, body: Partial<Pick<UserDto, 'role' | 'status'>>) {
    try {
      await apiFetch(`/users/${u.id}`, { method: 'PATCH', token, body: JSON.stringify(body) });
      load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function reset(u: UserDto) {
    const r = await apiFetch<{ temporaryPassword: string }>(`/users/${u.id}/reset-password`, {
      method: 'POST',
      token,
    });
    setMessage(`Contraseña temporal de ${u.email}: ${r.temporaryPassword}`);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <header>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-fg">Usuarios</h1>
        <p className="mt-1 text-sm text-fg-muted">Alta, roles y restablecimiento de contraseñas.</p>
      </header>

      {message ? (
        <div
          role="status"
          className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-fg"
        >
          {message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nuevo usuario</CardTitle>
          <CardDescription>
            La contraseña temporal se muestra una sola vez al crear o resetear.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                name="email"
                type="email"
                placeholder="nombre@empresa.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-fullName">Nombre completo</Label>
              <Input id="user-fullName" name="fullName" placeholder="Nombre completo" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-role">Rol</Label>
              <select
                id="user-role"
                name="role"
                defaultValue="operator"
                className={selectClassName}
              >
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 md:col-span-2 lg:col-span-3">
              <Label htmlFor="user-clientId">ID de cliente (sólo rol client)</Label>
              <Input id="user-clientId" name="clientId" placeholder="UUID del cliente" />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <Button type="submit">Crear usuario</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Usuarios registrados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>Listado de cuentas internas y de portal.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Nombre</TableHead>
                <TableHead scope="col">Email</TableHead>
                <TableHead scope="col">Rol</TableHead>
                <TableHead scope="col">Estado</TableHead>
                <TableHead scope="col">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page?.data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.fullName}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <label className="sr-only" htmlFor={`role-${u.id}`}>
                      Rol de {u.fullName}
                    </label>
                    <select
                      id={`role-${u.id}`}
                      value={u.role}
                      disabled={u.id === me?.id || u.role === 'client'}
                      className={cn(selectClassName, 'max-w-[10rem]')}
                      onChange={(e) => void patch(u, { role: e.target.value as UserRole })}
                    >
                      {USER_ROLES.filter((r) => r !== 'client' || u.role === 'client').map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="capitalize">{u.status}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {u.id !== me?.id ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void patch(u, { status: u.status === 'active' ? 'disabled' : 'active' })
                          }
                        >
                          {u.status === 'active' ? 'Desactivar' : 'Activar'}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void reset(u)}
                      >
                        Resetear contraseña
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
