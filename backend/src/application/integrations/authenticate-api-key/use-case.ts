import type { IntegrationActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import type { AuthUnitOfWork, Clock } from '../../shared/ports.js';
import { parseApiKey, type ApiKeyService } from '../shared/api-key.js';
import type { ApiKeyAuthRepository } from '../shared/ports.js';

type Repos = { apiKeyAuth: ApiKeyAuthRepository };

export class AuthenticateApiKey {
  constructor(
    private readonly uow: AuthUnitOfWork<Repos>,
    private readonly apiKeys: ApiKeyService,
    private readonly clock: Clock,
  ) {}

  async execute(
    apiKey: string,
    requestId: string,
    clientRequestId?: string,
    ip?: string | null,
  ): Promise<IntegrationActor> {
    const parsed = parseApiKey(apiKey);
    if (!parsed) throw new ApplicationError('unauthenticated', 'API key inválida');
    const now = this.clock.now();
    const actor = await this.uow.run(
      requestId,
      async ({ apiKeyAuth }) => {
        const row = await apiKeyAuth.findByPrefix(parsed.keyPrefix);
        if (!row) return null;
        if (row.revokedAt !== null) return null;
        if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) return null;
        if (row.integrationStatus !== 'activa') return null;
        if (!this.apiKeys.verify(parsed.secret, row.keyHash)) return null;
        await apiKeyAuth.updateLastUsed(row.credentialId, row.integrationId, now, ip ?? null);
        return {
          actorType: 'integration' as const,
          integrationId: row.integrationId,
          scopes: row.scopes,
          clientScope: row.clientScope,
          rateLimitPerMinute: row.rateLimitPerMinute,
          requestId,
          clientRequestId,
        };
      },
      clientRequestId,
    );
    if (!actor) throw new ApplicationError('unauthenticated', 'API key inválida');
    return actor;
  }
}
