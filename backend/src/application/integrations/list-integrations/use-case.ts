import type { IntegrationListQuery } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { IntegrationView } from '../shared/integration-views.js';
import type { IntegrationListRepository } from '../shared/ports.js';

type Repos = { integrationsList: IntegrationListRepository };

export class ListIntegrations {
  constructor(private readonly uow: UnitOfWork<Repos>) {}

  async execute(
    actor: UserActor,
    query: IntegrationListQuery,
  ): Promise<{ items: IntegrationView[]; total: number }> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, ({ integrationsList }) => integrationsList.list(query));
  }
}
