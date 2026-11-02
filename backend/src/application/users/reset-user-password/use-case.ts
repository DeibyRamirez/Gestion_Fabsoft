import type { PasswordHasher } from '../../auth/ports.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { TemporaryPasswordGenerator } from '../shared/ports.js';
import type { ResetUserPasswordRepos } from './ports.js';

/** Contraseña temporal + revocación de TODAS las sesiones del usuario, en una transacción. */
export class ResetUserPassword {
  constructor(
    private readonly uow: UnitOfWork<ResetUserPasswordRepos>,
    private readonly hasher: PasswordHasher,
    private readonly passwords: TemporaryPasswordGenerator,
  ) {}

  async execute(actor: UserActor, id: string): Promise<{ temporaryPassword: string }> {
    requireRole(actor, 'admin');
    const temporaryPassword = this.passwords.generate();
    const hash = await this.hasher.hash(temporaryPassword);
    await this.uow.run(actor, async ({ userPasswordReset, audit, sessions }) => {
      if (!(await userPasswordReset.setTemporaryPassword(id, hash, actor.userId))) {
        throw new ApplicationError('not_found', 'Usuario no encontrado');
      }
      await sessions.revokeAllForUser(id, 'admin');
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'user.password_reset',
        resourceType: 'user',
        resourceId: id,
        requestId: actor.requestId,
      });
    });
    return { temporaryPassword };
  }
}
