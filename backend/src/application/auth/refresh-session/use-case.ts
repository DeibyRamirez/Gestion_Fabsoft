import { ApplicationError } from '../../shared/application-error.js';
import type { AuthUnitOfWork, Clock } from '../../shared/ports.js';
import type { RefreshTokenFactory, SessionMeta, SessionResult } from '../ports.js';
import type { SessionIssuer } from '../session-issuer.js';
import type { RefreshSessionRepos } from './ports.js';

type Outcome = { ok: true; session: SessionResult } | { ok: false };

/** Rota el refresh token; reutilizar uno revocado revoca toda la familia (ADR-001, T-AUTH-01/02). */
export class RefreshSession {
  constructor(
    private readonly uow: AuthUnitOfWork<RefreshSessionRepos>,
    private readonly refreshTokens: RefreshTokenFactory,
    private readonly issuer: SessionIssuer,
    private readonly clock: Clock,
  ) {}

  async execute(
    refreshToken: string | undefined,
    meta: SessionMeta & { requestId: string },
  ): Promise<SessionResult> {
    if (!refreshToken) throw new ApplicationError('unauthenticated', 'Falta el refresh token');
    const now = this.clock.now();
    const outcome = await this.uow.run<Outcome>(meta.requestId, async ({ refresh, audit }) => {
      const stored = await refresh.findByHashForUpdate(this.refreshTokens.hash(refreshToken));
      if (!stored) return { ok: false };
      if (stored.revokedAt) {
        await refresh.revokeFamily(stored.familyId, 'reuse_detected', now);
        await audit.write({
          actor: { type: 'system' },
          action: 'auth.refresh_reuse_detected',
          resourceType: 'user',
          resourceId: stored.userId,
          requestId: meta.requestId,
          ip: meta.ip,
        });
        return { ok: false };
      }
      if (stored.expiresAt <= now) return { ok: false };
      const user = await refresh.loadUser(stored.userId);
      if (!user || user.status !== 'active') {
        await refresh.revokeFamily(stored.familyId, 'user_disabled', now);
        return { ok: false };
      }
      const { session, row } = await this.issuer.issue(user, stored.familyId, meta);
      await refresh.rotate(stored.id, row, now);
      return { ok: true, session };
    });
    if (!outcome.ok) throw new ApplicationError('unauthenticated', 'Sesión inválida o expirada');
    return outcome.session;
  }
}
