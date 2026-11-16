import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { GetSubscriptionRepos } from './ports.js';

export class GetSubscription {
  constructor(private readonly uow: UnitOfWork<GetSubscriptionRepos>) {}

  async execute(actor: UserActor, id: string): Promise<SubscriptionView> {
    requireRole(actor, 'admin', 'operator');
    const subscription = await this.uow.run(actor, ({ subscriptionDetail }) =>
      subscriptionDetail.findById(id),
    );
    if (!subscription) throw new ApplicationError('not_found', 'Suscripción no encontrada');
    return subscription;
  }
}
