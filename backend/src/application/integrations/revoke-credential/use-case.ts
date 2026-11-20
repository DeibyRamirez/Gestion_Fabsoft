import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, Clock, UnitOfWork } from '../../shared/ports.js';
import type { ApiCredentialView } from '../shared/integration-views.js';
import type { CredentialQuery } from '../shared/ports.js';

type Repos = { credentials: CredentialQuery; audit: AuditWriter };

export class RevokeIntegrationCredential {
  constructor(
    private readonly uow: UnitOfWork<Repos>,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: UserActor,
    integrationId: string,
    credentialId: string,
  ): Promise<ApiCredentialView> {
    requireRole(actor, 'admin');
    const at = this.clock.now();
    return this.uow.run(actor, async ({ credentials, audit }) => {
      const revoked = await credentials.revoke(integrationId, credentialId, actor.userId, at);
      if (!revoked) throw new ApplicationError('not_found', 'Credencial no encontrada');
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'api_credential.revoked',
        resourceType: 'api_credential',
        resourceId: credentialId,
        changes: { after: { revokedAt: revoked.revokedAt?.toISOString() ?? null } },
        requestId: actor.requestId,
      });
      return revoked;
    });
  }
}
