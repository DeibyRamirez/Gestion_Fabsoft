import type { ApiCredentialCreateInput } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, Clock, UnitOfWork } from '../../shared/ports.js';
import type { ApiCredentialView } from '../shared/integration-views.js';
import type { ApiKeyService } from '../shared/api-key.js';
import type { CredentialQuery, IntegrationGetRepository } from '../shared/ports.js';

type Repos = {
  integrationDetail: IntegrationGetRepository;
  credentials: CredentialQuery;
  audit: AuditWriter;
};

export interface CreatedCredential {
  credential: ApiCredentialView;
  apiKey: string;
}

const DAY_MS = 86_400_000;

export class CreateIntegrationCredential {
  constructor(
    private readonly uow: UnitOfWork<Repos>,
    private readonly apiKeys: ApiKeyService,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: UserActor,
    integrationId: string,
    input: ApiCredentialCreateInput,
  ): Promise<CreatedCredential> {
    requireRole(actor, 'admin');
    const now = this.clock.now();
    return this.uow.run(actor, async ({ integrationDetail, credentials, audit }) => {
      const integration = await integrationDetail.findById(integrationId);
      if (!integration) throw new ApplicationError('not_found', 'Integración no encontrada');
      const active = await credentials.countActive(integrationId, now);
      if (active >= 2) {
        throw new ApplicationError(
          'credential_limit_reached',
          'La integración ya tiene 2 credenciales activas',
        );
      }

      const generated = this.apiKeys.generate();
      const expiresAt =
        input.expiresAt === null
          ? null
          : input.expiresAt !== undefined
            ? new Date(input.expiresAt)
            : integration.manifest.credential_ttl_days
              ? new Date(now.getTime() + integration.manifest.credential_ttl_days * DAY_MS)
              : null;

      const credential = await credentials.insertCredential({
        integrationId,
        keyPrefix: generated.keyPrefix,
        keyHash: generated.keyHash,
        label: input.label ?? null,
        expiresAt,
        createdBy: actor.userId,
      });
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'api_credential.created',
        resourceType: 'api_credential',
        resourceId: credential.id,
        changes: {
          after: {
            integrationId,
            keyPrefix: credential.keyPrefix,
            label: credential.label,
            expiresAt: credential.expiresAt?.toISOString() ?? null,
          },
        },
        requestId: actor.requestId,
      });
      return { credential, apiKey: generated.apiKey };
    });
  }
}
