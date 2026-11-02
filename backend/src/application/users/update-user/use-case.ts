import type { UserUpdateInput } from '@fabsoft/shared';
import { applyUserChange } from '../../../domain/users/user-role-rules.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditAction, UnitOfWork } from '../../shared/ports.js';
import type { UserView } from '../shared/user-view.js';
import type { UpdateUserRepos } from './ports.js';

/** Cambia nombre, rol, cliente o estado. Desactivar o cambiar rol revoca sesiones en la misma transacción. */
export class UpdateUser {
  constructor(private readonly uow: UnitOfWork<UpdateUserRepos>) {}

  async execute(actor: UserActor, id: string, input: UserUpdateInput): Promise<UserView> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ userUpdate, audit, sessions }) => {
      const current = await userUpdate.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Usuario no encontrado');
      const next = applyUserChange(current, input, {
        actorUserId: actor.userId,
        activeAdminCount: await userUpdate.countActiveAdmins(),
      });
      const saved = await userUpdate.save(id, {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        role: next.role,
        clientId: next.clientId,
        status: next.status,
        updatedBy: actor.userId,
      });
      if (saved === 'unknown_client')
        throw new ApplicationError('validation_error', 'El cliente indicado no existe');
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: auditAction(current, saved),
        resourceType: 'user',
        resourceId: id,
        changes: { before: snapshot(current), after: snapshot(saved) },
        requestId: actor.requestId,
      });
      if (saved.status === 'disabled' && current.status !== 'disabled') {
        await sessions.revokeAllForUser(id, 'user_disabled');
      } else if (saved.role !== current.role) {
        await sessions.revokeAllForUser(id, 'admin');
      }
      return saved;
    });
  }
}

function auditAction(before: UserView, after: UserView): AuditAction {
  if (after.status === 'disabled' && before.status !== 'disabled') return 'user.disabled';
  if (after.role !== before.role) return 'user.role_changed';
  return 'user.updated';
}

const snapshot = (u: UserView) => ({
  fullName: u.fullName,
  role: u.role,
  clientId: u.clientId,
  status: u.status,
});
