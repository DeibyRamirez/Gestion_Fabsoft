import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { IntegrationView } from '../shared/integration-views.js';
import type { IntegrationGetRepository } from '../shared/ports.js';

type Repos = { integrationDetail: IntegrationGetRepository };

export class GetIntegration {
  constructor(private readonly uow: UnitOfWork<Repos>) {}

  async execute(actor: UserActor, id: string): Promise<IntegrationView> {
    requireRole(actor, 'admin');
    const integration = await this.uow.run(actor, ({ integrationDetail }) =>
      integrationDetail.findById(id),
    );
    if (!integration) throw new ApplicationError('not_found', 'Integración no encontrada');
    return integration;
  }
}
