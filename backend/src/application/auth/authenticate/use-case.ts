import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import type { AuthUnitOfWork } from '../../shared/ports.js';
import type { AccessTokenService } from '../ports.js';
import type { AuthenticateRepos } from './ports.js';

export interface AuthenticatedActor {
  actor: UserActor;
  mustChangePassword: boolean;
}

/**
 * Verifica el JWT y recarga estado/rol/cliente desde la BD en cada petición:
 * usuario desactivado o con rol cambiado deja de operar de inmediato (ADR-001, T-AUTH-03).
 */
export class AuthenticateAccessToken {
  constructor(
    private readonly uow: AuthUnitOfWork<AuthenticateRepos>,
    private readonly tokens: AccessTokenService,
  ) {}

  async execute(
    token: string,
    requestId: string,
    clientRequestId?: string,
  ): Promise<AuthenticatedActor> {
    const claims = await this.tokens.verify(token);
    const user = await this.uow.run(requestId, ({ authenticate }) =>
      authenticate.loadUser(claims.userId),
    );
    if (!user || user.status !== 'active')
      throw new ApplicationError('unauthenticated', 'Token inválido');
    return {
      actor: {
        actorType: 'user',
        userId: user.id,
        role: user.role,
        clientId: user.clientId,
        requestId,
        clientRequestId,
      },
      mustChangePassword: user.mustChangePassword,
    };
  }
}
