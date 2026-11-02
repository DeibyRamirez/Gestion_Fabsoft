import type { UserView } from '../../../../application/users/shared/user-view.js';
import type { AuthUser } from '../../../../application/auth/ports.js';

/**
 * Columnas explícitas de app.users. Contrato 0003: prohibido `select *`/`returning *`
 * (password_hash no es legible por fabsoft_app) y el hash sólo vía app.auth_password_hash().
 */
export const USER_COLUMNS = `id, email, full_name, role, client_id, status, must_change_password,
  last_login_at, created_at, updated_at`;

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: UserView['role'];
  client_id: string | null;
  status: UserView['status'];
  must_change_password: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export const toUserView = (r: UserRow): UserView => ({
  id: r.id,
  email: r.email,
  fullName: r.full_name,
  role: r.role,
  clientId: r.client_id,
  status: r.status,
  mustChangePassword: r.must_change_password,
  lastLoginAt: r.last_login_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const toAuthUser = (r: UserRow): AuthUser => ({
  id: r.id,
  email: r.email,
  fullName: r.full_name,
  role: r.role,
  clientId: r.client_id,
  status: r.status,
  mustChangePassword: r.must_change_password,
});
