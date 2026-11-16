import type { SubscriptionListQuery } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { ListSubscriptionsRepos } from './ports.js';

export class ListSubscriptions {
  constructor(private readonly uow: UnitOfWork<ListSubscriptionsRepos>) {}

  async execute(
    actor: UserActor,
    query: SubscriptionListQuery,
  ): Promise<{ items: SubscriptionView[]; total: number }> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, ({ subscriptionsList }) => subscriptionsList.list(query));
  }
}
