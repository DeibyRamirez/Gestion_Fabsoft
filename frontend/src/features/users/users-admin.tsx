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
    <section style={{ display: 'grid', gap: 24 }}>
      <h1>Usuarios</h1>
      {message && <p role="status">{message}</p>}
      <form onSubmit={create} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input name="email" type="email" placeholder="email" required />
        <input name="fullName" placeholder="Nombre completo" required />
        <select name="role" defaultValue="operator">
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input name="clientId" placeholder="clientId (sólo rol client)" />
        <button type="submit">Crear</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {page?.data.map((u) => (
            <tr key={u.id}>
              <td>{u.fullName}</td>
              <td>{u.email}</td>
              <td>
                <select
                  value={u.role}
                  disabled={u.id === me?.id || u.role === 'client'}
                  onChange={(e) => void patch(u, { role: e.target.value as UserRole })}
                >
                  {USER_ROLES.filter((r) => r !== 'client' || u.role === 'client').map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </td>
              <td>{u.status}</td>
              <td style={{ display: 'flex', gap: 4 }}>
                {u.id !== me?.id && (
                  <button
                    type="button"
                    onClick={() =>
                      void patch(u, { status: u.status === 'active' ? 'disabled' : 'active' })
                    }
                  >
                    {u.status === 'active' ? 'Desactivar' : 'Activar'}
                  </button>
                )}
                <button type="button" onClick={() => void reset(u)}>
                  Resetear contraseña
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
