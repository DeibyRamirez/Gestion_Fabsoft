import type { ChangePasswordInput } from '@fabsoft/shared';
import { assertValidNewPassword } from '../../../domain/users/password-policy.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import type { Clock, UnitOfWork } from '../../shared/ports.js';
import type { PasswordHasher, RefreshTokenFactory } from '../ports.js';
import type { ChangePasswordRepos } from './ports.js';

/**
 * Cambio de contraseña propia con el contexto del propio usuario (no system).
 * Revoca las demás sesiones y conserva la actual (familia del refresh de la cookie), en la misma transacción.
 */
export class ChangePassword {
  constructor(
    private readonly uow: UnitOfWork<ChangePasswordRepos>,
    private readonly hasher: PasswordHasher,
    private readonly refreshTokens: RefreshTokenFactory,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: UserActor,
    input: ChangePasswordInput,
    currentRefreshToken?: string,
  ): Promise<void> {
    const ok = await this.uow.run(actor, async ({ password, sessions }) => {
      const user = await password.loadWithSecret(actor.userId);
      if (!user || !(await this.hasher.verify(user.passwordHash, input.currentPassword)))
        return false;
      assertValidNewPassword(input.newPassword, user.email, input.currentPassword);
      await password.updatePassword(
        user.id,
        await this.hasher.hash(input.newPassword),
        this.clock.now(),
      );
      await sessions.revokeAllForUser(
        user.id,
        'password_changed',
        currentRefreshToken ? this.refreshTokens.hash(currentRefreshToken) : undefined,
      );
      return true;
    });
    if (!ok)
      throw new ApplicationError('invalid_credentials', 'La contraseña actual no es correcta');
  }
}
