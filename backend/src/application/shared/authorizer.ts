import type { Role } from '../../domain/users/role.js';
import type { UserActor } from './actor.js';
import { ApplicationError } from './application-error.js';

/** Guarda de rol en el caso de uso (primera barrera; RLS es la segunda, ADR-004 §7). */
export function requireRole(actor: UserActor, ...roles: Role[]): void {
  if (!roles.includes(actor.role)) throw new ApplicationError('forbidden', 'Permiso insuficiente');
}
