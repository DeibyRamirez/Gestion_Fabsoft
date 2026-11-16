import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { GetSubscriptionQuery } from '../get-subscription/ports.js';
import type { SubscriptionPeriodView } from '../shared/subscription-view.js';
import type { ListSubscriptionPeriodsRepos } from './ports.js';

type ListSubscriptionPeriodsUow = ListSubscriptionPeriodsRepos & {
  subscriptionDetail: GetSubscriptionQuery;
};

export class ListSubscriptionPeriods {
  constructor(private readonly uow: UnitOfWork<ListSubscriptionPeriodsUow>) {}

  async execute(actor: UserActor, subscriptionId: string): Promise<SubscriptionPeriodView[]> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, async ({ subscriptionPeriods, subscriptionDetail }) => {
      const subscription = await subscriptionDetail.findById(subscriptionId);
      if (!subscription) throw new ApplicationError('not_found', 'Suscripción no encontrada');
      return subscriptionPeriods.list(subscriptionId);
    });
  }
}
