import type { Role, UserStatus } from '../../../domain/users/role.js';

/** Proyección de usuario para la API (nunca incluye password_hash). */
export interface UserView {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  clientId: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
