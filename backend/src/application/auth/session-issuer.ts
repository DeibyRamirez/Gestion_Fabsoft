import type { Clock, IdGenerator } from '../shared/ports.js';
import type {
  AccessTokenService,
  AuthPolicy,
  AuthUser,
  NewRefreshToken,
  RefreshTokenFactory,
  SessionMeta,
  SessionResult,
} from './ports.js';

/** Construye access + refresh de una sesión (compartido por login y refresh; SRP). */
export class SessionIssuer {
  constructor(
    private readonly tokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenFactory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly policy: AuthPolicy,
  ) {}

  async issue(
    user: AuthUser,
    familyId: string,
    meta: SessionMeta,
  ): Promise<{ session: SessionResult; row: NewRefreshToken }> {
    const access = await this.tokens.issue({
      userId: user.id,
      role: user.role,
      clientId: user.clientId,
    });
    const { token, hash } = this.refreshTokens.generate();
    const expiresAt = new Date(
      this.clock.now().getTime() + this.policy.refreshTokenTtlDays * 86_400_000,
    );
    const row: NewRefreshToken = {
      id: this.ids.uuid(),
      userId: user.id,
      familyId,
      tokenHash: hash,
      expiresAt,
      userAgent: meta.userAgent,
      ip: meta.ip,
    };
    return {
      row,
      session: {
        accessToken: access.token,
        expiresIn: access.expiresIn,
        refreshToken: token,
        refreshExpiresAt: expiresAt,
        user,
      },
    };
  }
}
