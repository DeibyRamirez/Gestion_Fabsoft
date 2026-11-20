import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { PortalPeriodView } from '../shared/portal-views.js';
import type { ListPortalSubscriptionPeriodsRepos } from './ports.js';

export class ListPortalSubscriptionPeriods {
  constructor(private readonly uow: UnitOfWork<ListPortalSubscriptionPeriodsRepos>) {}

  async execute(actor: UserActor, subscriptionId: string): Promise<PortalPeriodView[]> {
    requireRole(actor, 'client');
    if (!actor.clientId) throw new ApplicationError('forbidden', 'Usuario sin organización');
    const clientId = actor.clientId;
    const result = await this.uow.run(actor, async ({ portalSubscription, portalPeriods }) => {
      const subscription = await portalSubscription.findById(clientId, subscriptionId);
      if (!subscription) return null;
      return portalPeriods.list(subscriptionId);
    });
    if (!result) throw new ApplicationError('not_found', 'Suscripción no encontrada');
    return result;
  }
}
