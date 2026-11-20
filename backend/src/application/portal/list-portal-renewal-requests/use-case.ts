import type { PortalRenewalRequestListQuery as PortalRenewalRequestListQueryInput } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { PortalRenewalRequestView } from '../shared/portal-views.js';
import type { ListPortalRenewalRequestsRepos } from './ports.js';

export class ListPortalRenewalRequests {
  constructor(private readonly uow: UnitOfWork<ListPortalRenewalRequestsRepos>) {}

  async execute(
    actor: UserActor,
    query: PortalRenewalRequestListQueryInput,
  ): Promise<{ items: PortalRenewalRequestView[]; total: number }> {
    requireRole(actor, 'client');
    if (!actor.clientId) throw new ApplicationError('forbidden', 'Usuario sin organización');
    const clientId = actor.clientId;
    return this.uow.run(actor, ({ portalRenewalRequests }) =>
      portalRenewalRequests.list(clientId, query),
    );
  }
}
