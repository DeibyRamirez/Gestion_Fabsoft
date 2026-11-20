import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { ApiCredentialView } from '../shared/integration-views.js';
import type { CredentialQuery, IntegrationGetRepository } from '../shared/ports.js';

type Repos = {
  integrationDetail: IntegrationGetRepository;
  credentials: CredentialQuery;
};

export class ListIntegrationCredentials {
  constructor(private readonly uow: UnitOfWork<Repos>) {}

  async execute(actor: UserActor, integrationId: string): Promise<ApiCredentialView[]> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ integrationDetail, credentials }) => {
      const integration = await integrationDetail.findById(integrationId);
      if (!integration) throw new ApplicationError('not_found', 'Integración no encontrada');
      return credentials.listCredentials(integrationId);
    });
  }
}
