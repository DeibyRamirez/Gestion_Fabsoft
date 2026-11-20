'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  USER_ROLES,
  UserCreateSchema,
  type ClientDto,
  type ClientPage,
  type UserCreatedDto,
  type UserDto,
  type UserPage,
  type UserRole,
} from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { ConfirmDialog } from '@/shared/components/action-dialog';
import { BentoCard } from '@/shared/components/bento';
import { CopyButton } from '@/shared/components/copy-button';
import { FormField } from '@/shared/components/form-field';
import { FormGrid } from '@/shared/components/form-layout';
import { OneTimeSecret } from '@/shared/components/one-time-secret';
import { PageHeader } from '@/shared/components/page-header';
import { SectionHeader } from '@/shared/components/section-header';
import { USER_ROLE_LABELS } from '@/shared/lib/labels';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { StatusBadge } from '@/shared/ui/status-badge';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { useToast } from '@/shared/ui/toast';

/** Gestión de usuarios (sólo admin; la API devuelve 403 a otros roles). */
export function UsersAdmin() {
  const { token, user: me } = useAuth();
  const [page, setPage] = useState<UserPage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [secretFor, setSecretFor] = useState<string | null>(null);
  const [toDisable, setToDisable] = useState<UserDto | null>(null);
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [role, setRole] = useState<UserRole>('operator');
  const [clientId, setClientId] = useState('');
  const [version, setVersion] = useState(0);
  const toast = useToast();
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

  useEffect(() => {
    let alive = true;
    apiFetch<ClientPage>('/clients?pageSize=100&status=activo', { token })
      .then((p) => alive && setClients(p.data))
      .catch(() => alive && setClients([]));
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
      setMessage('Usuario creado.');
      setSecret(created.temporaryPassword);
      setSecretFor(String(parsed.data.email));
      toast('Usuario creado.');
      form.reset();
      setRole('operator');
      setClientId('');
      load();
    } catch (err) {
      const errorMessage =
        err instanceof ApiError && err.problem?.code === 'duplicate_email'
          ? 'Ese email ya existe.'
          : 'No se pudo crear el usuario.';
      setMessage(errorMessage);
      toast(errorMessage, 'error');
    }
  }

  async function patch(u: UserDto, body: Partial<Pick<UserDto, 'role' | 'status'>>) {
    try {
      await apiFetch(`/users/${u.id}`, { method: 'PATCH', token, body: JSON.stringify(body) });
      toast('Usuario actualizado.');
      load();
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Error';
      setMessage(errorMessage);
      toast(errorMessage, 'error');
    }
  }

  async function reset(u: UserDto) {
    const r = await apiFetch<{ temporaryPassword: string }>(`/users/${u.id}/reset-password`, {
      method: 'POST',
      token,
    });
    setSecret(r.temporaryPassword);
    setSecretFor(u.email);
    setMessage(`Contraseña temporal generada para ${u.email}.`);
    toast('Contraseña temporal generada.');
  }

  function requestStatusToggle(u: UserDto) {
    if (u.status === 'activo') setToDisable(u);
    else void patch(u, { status: 'activo' });
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader title="Usuarios" description="Alta, roles y restablecimiento de contraseñas." />

      <ConfirmDialog
        open={toDisable !== null}
        onOpenChange={(open) => {
          if (!open) setToDisable(null);
        }}
        title="Desactivar usuario"
        description={
          toDisable
            ? `¿Desactivar a ${toDisable.fullName}? No podrá iniciar sesión hasta que lo reactives.`
            : ''
        }
        confirmLabel="Desactivar"
        destructive
        onConfirm={() => {
          if (toDisable) void patch(toDisable, { status: 'deshabilitado' });
        }}
      />

      {message ? (
        <p role="status" className="text-sm text-fg-muted">
          {message}
        </p>
      ) : null}

      {secret ? (
        <OneTimeSecret
          value={secret}
          title={`Contraseña temporal${secretFor ? ` de ${secretFor}` : ''}`}
          description="Se muestra una sola vez. Compártela por un canal seguro."
        />
      ) : null}

      <BentoCard>
        <SectionHeader
          title="Nuevo usuario"
          description="La contraseña temporal se muestra una sola vez al crear o resetear."
        />
        <form onSubmit={create} className="mt-4">
          <FormGrid columns={3}>
            <FormField label="Email" htmlFor="user-email">
              <Input
                id="user-email"
                name="email"
                type="email"
                placeholder="nombre@empresa.com"
                required
              />
            </FormField>
            <FormField label="Nombre completo" htmlFor="user-fullName">
              <Input id="user-fullName" name="fullName" placeholder="Nombre completo" required />
            </FormField>
            <FormField label="Rol" htmlFor="user-role">
              <select
                id="user-role"
                name="role"
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as UserRole);
                  setClientId('');
                }}
                className={nativeSelectClassName}
              >
                {USER_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {USER_ROLE_LABELS[value]}
                  </option>
                ))}
              </select>
            </FormField>
            {role === 'client' ? (
              <FormField
                label="Cliente"
                htmlFor="user-clientId"
                className="md:col-span-2 lg:col-span-3"
                hint="El usuario cliente verá el portal de esta empresa."
                required
              >
                <select
                  id="user-clientId"
                  name="clientId"
                  required
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  className={nativeSelectClassName}
                >
                  <option value="">Seleccione una empresa…</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.legalName}
                    </option>
                  ))}
                </select>
                {clientId ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-muted px-3 py-2">
                    <span className="text-xs text-fg-muted">ID cliente:</span>
                    <code className="min-w-0 flex-1 break-all font-mono text-xs">{clientId}</code>
                    <CopyButton
                      value={clientId}
                      label=""
                      aria-label="Copiar ID cliente"
                      size="icon"
                    />
                  </div>
                ) : clients.length === 0 ? (
                  <p className="text-xs text-fg-muted">
                    No hay clientes activos. Crea una empresa en Clientes antes de asignar un
                    usuario cliente.
                  </p>
                ) : null}
              </FormField>
            ) : null}
          </FormGrid>
          <div className="mt-4 flex justify-end">
            <Button type="submit">Crear usuario</Button>
          </div>
        </form>
      </BentoCard>

      <BentoCard>
        <SectionHeader title="Usuarios registrados" />
        <div className="mt-4">
          {page === null && !message ? (
            <p role="status" aria-busy="true" className="text-sm text-fg-muted">
              Cargando usuarios…
            </p>
          ) : null}
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
                  <TableCell className="font-semibold text-fg">{u.fullName}</TableCell>
                  <TableCell className="text-fg-muted">{u.email}</TableCell>
                  <TableCell>
                    <label className="sr-only" htmlFor={`role-${u.id}`}>
                      Rol de {u.fullName}
                    </label>
                    <select
                      id={`role-${u.id}`}
                      value={u.role}
                      disabled={u.id === me?.id || u.role === 'client'}
                      className={`${nativeSelectClassName} max-w-40`}
                      onChange={(e) => void patch(u, { role: e.target.value as UserRole })}
                    >
                      {USER_ROLES.filter((r) => r !== 'client' || u.role === 'client').map((r) => (
                        <option key={r} value={r}>
                          {USER_ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="user" value={u.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      {u.id !== me?.id ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => requestStatusToggle(u)}
                        >
                          {u.status === 'activo' ? 'Desactivar' : 'Activar'}
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
        </div>
      </BentoCard>
    </div>
  );
}
