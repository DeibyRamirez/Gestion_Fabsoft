import type { PortalSubscriptionListQuery as PortalSubscriptionListQueryInput } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { PortalSubscriptionView } from '../shared/portal-views.js';
import type { ListPortalSubscriptionsRepos } from './ports.js';

export class ListPortalSubscriptions {
  constructor(private readonly uow: UnitOfWork<ListPortalSubscriptionsRepos>) {}

  async execute(
    actor: UserActor,
    query: PortalSubscriptionListQueryInput,
  ): Promise<{ items: PortalSubscriptionView[]; total: number }> {
    requireRole(actor, 'client');
    if (!actor.clientId) throw new ApplicationError('forbidden', 'Usuario sin organización');
    const clientId = actor.clientId;
    return this.uow.run(actor, ({ portalSubscriptions }) =>
      portalSubscriptions.list(clientId, query),
    );
  }
}
