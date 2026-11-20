import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { PortalSubscriptionView } from '../shared/portal-views.js';
import type { GetPortalSubscriptionRepos } from './ports.js';

export class GetPortalSubscription {
  constructor(private readonly uow: UnitOfWork<GetPortalSubscriptionRepos>) {}

  async execute(actor: UserActor, id: string): Promise<PortalSubscriptionView> {
    requireRole(actor, 'client');
    if (!actor.clientId) throw new ApplicationError('forbidden', 'Usuario sin organización');
    const clientId = actor.clientId;
    const subscription = await this.uow.run(actor, ({ portalSubscription }) =>
      portalSubscription.findById(clientId, id),
    );
    if (!subscription) throw new ApplicationError('not_found', 'Suscripción no encontrada');
    return subscription;
  }
}
