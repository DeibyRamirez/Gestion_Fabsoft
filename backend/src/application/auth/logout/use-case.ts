import type { AuthUnitOfWork, Clock } from '../../shared/ports.js';
import type { RefreshTokenFactory } from '../ports.js';
import type { LogoutRepos } from './ports.js';

/** Cierra la sesión revocando la familia del refresh token. Idempotente. */
export class Logout {
  constructor(
    private readonly uow: AuthUnitOfWork<LogoutRepos>,
    private readonly refreshTokens: RefreshTokenFactory,
    private readonly clock: Clock,
  ) {}

  async execute(refreshToken: string | undefined, requestId: string): Promise<void> {
    if (!refreshToken) return;
    await this.uow.run(requestId, async ({ logout }) => {
      const stored = await logout.findByHash(this.refreshTokens.hash(refreshToken));
      if (stored && !stored.revokedAt)
        await logout.revokeFamily(stored.familyId, 'logout', this.clock.now());
    });
  }
}
