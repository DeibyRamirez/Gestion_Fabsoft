import type { UserCreateInput } from '@fabsoft/shared';
import type { PasswordHasher } from '../../auth/ports.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { TemporaryPasswordGenerator } from '../shared/ports.js';
import type { UserView } from '../shared/user-view.js';
import type { CreateUserRepos } from './ports.js';

/** Alta de usuario con contraseña temporal (se devuelve una vez; cambio obligatorio). Auditado. */
export class CreateUser {
  constructor(
    private readonly uow: UnitOfWork<CreateUserRepos>,
    private readonly hasher: PasswordHasher,
    private readonly passwords: TemporaryPasswordGenerator,
  ) {}

  async execute(
    actor: UserActor,
    input: UserCreateInput,
  ): Promise<{ user: UserView; temporaryPassword: string }> {
    requireRole(actor, 'admin');
    const temporaryPassword = this.passwords.generate();
    const passwordHash = await this.hasher.hash(temporaryPassword);
    const outcome = await this.uow.run(actor, async ({ userCreate, audit }) => {
      const res = await userCreate.insert({
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        clientId: input.clientId ?? null,
        passwordHash,
        createdBy: actor.userId,
      });
      if (res.ok) {
        await audit.write({
          actor: { type: 'user', userId: actor.userId },
          action: 'user.created',
          resourceType: 'user',
          resourceId: res.user.id,
          changes: {
            after: { email: res.user.email, role: res.user.role, clientId: res.user.clientId },
          },
          requestId: actor.requestId,
        });
      }
      return res;
    });
    if (!outcome.ok) {
      if (outcome.reason === 'duplicate_email')
        throw new ApplicationError('duplicate_email', 'El email ya existe');
      throw new ApplicationError('validation_error', 'El cliente indicado no existe');
    }
    return { user: outcome.user, temporaryPassword };
  }
}
