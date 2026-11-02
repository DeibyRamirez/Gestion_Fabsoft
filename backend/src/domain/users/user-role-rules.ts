import { DomainError } from '../shared/domain-error.js';
import type { Role, UserStatus } from './role.js';

export interface UserState {
  id: string;
  role: Role;
  clientId: string | null;
  status: UserStatus;
}

export interface UserChange {
  role?: Role | undefined;
  clientId?: string | null | undefined;
  status?: UserStatus | undefined;
}

/** Aplica un cambio administrativo validando las invariantes (permissions-matrix nota 1, users_client_role_consistency). */
export function applyUserChange(
  target: UserState,
  change: UserChange,
  ctx: { actorUserId: string; activeAdminCount: number },
): UserState {
  const next: UserState = {
    ...target,
    role: change.role ?? target.role,
    status: change.status ?? target.status,
    clientId: change.clientId !== undefined ? change.clientId : target.clientId,
  };
  if (next.role !== 'client' && change.clientId === undefined) next.clientId = null;

  if ((next.role === 'client') !== (next.clientId !== null)) {
    throw new DomainError('validation_error', 'Rol y cliente inconsistentes', [
      { path: 'clientId', message: 'Obligatorio si role=client y prohibido en otro caso' },
    ]);
  }

  const losesAdmin =
    target.role === 'admin' &&
    target.status === 'active' &&
    (next.role !== 'admin' || next.status !== 'active');
  if (losesAdmin && target.id === ctx.actorUserId) {
    throw new DomainError(
      'invalid_state_transition',
      'Un admin no puede desactivarse ni quitarse el rol a sí mismo',
    );
  }
  if (losesAdmin && ctx.activeAdminCount <= 1) {
    throw new DomainError('invalid_state_transition', 'Debe quedar al menos un admin activo');
  }
  return next;
}
