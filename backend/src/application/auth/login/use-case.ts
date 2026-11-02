import type { LoginInput } from '@fabsoft/shared';
import { ApplicationError } from '../../shared/application-error.js';
import type { AuthUnitOfWork, Clock, IdGenerator } from '../../shared/ports.js';
import type { PasswordHasher, SessionMeta, SessionResult } from '../ports.js';
import type { SessionIssuer } from '../session-issuer.js';
import type { LoginRepos } from './ports.js';

/**
 * Login con email + contraseña. Respuesta idéntica para email inexistente, contraseña errónea
 * o usuario desactivado; se verifica un hash ficticio para igualar tiempos.
 */
export class Login {
  constructor(
    private readonly uow: AuthUnitOfWork<LoginRepos>,
    private readonly hasher: PasswordHasher,
    private readonly issuer: SessionIssuer,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly dummyHash: string,
  ) {}

  async execute(
    input: LoginInput,
    meta: SessionMeta & { requestId: string },
  ): Promise<SessionResult> {
    const result = await this.uow.run(meta.requestId, async ({ login, audit }) => {
      const user = await login.findByEmail(input.email);
      const ok = await this.hasher.verify(user?.passwordHash ?? this.dummyHash, input.password);
      if (!user || !ok || user.status !== 'active') {
        await audit.write({
          actor: { type: 'system' },
          action: 'auth.login_failed',
          resourceType: 'user',
          resourceId: user?.id ?? 'unknown',
          requestId: meta.requestId,
          ip: meta.ip,
        });
        return null;
      }
      const publicUser = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        clientId: user.clientId,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
      };
      const { session, row } = await this.issuer.issue(publicUser, this.ids.uuid(), meta);
      await login.createRefreshToken(row);
      await login.recordSuccessfulLogin(user.id, this.clock.now());
      return session;
    });
    if (!result) throw new ApplicationError('invalid_credentials', 'Credenciales inválidas');
    return result;
  }
}
