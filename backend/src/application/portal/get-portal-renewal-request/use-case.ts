import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { PortalRenewalRequestView } from '../shared/portal-views.js';
import type { GetPortalRenewalRequestRepos } from './ports.js';

export class GetPortalRenewalRequest {
  constructor(private readonly uow: UnitOfWork<GetPortalRenewalRequestRepos>) {}

  async execute(actor: UserActor, id: string): Promise<PortalRenewalRequestView> {
    requireRole(actor, 'client');
    if (!actor.clientId) throw new ApplicationError('forbidden', 'Usuario sin organización');
    const clientId = actor.clientId;
    const request = await this.uow.run(actor, ({ portalRenewalRequest }) =>
      portalRenewalRequest.findById(clientId, id),
    );
    if (!request) throw new ApplicationError('not_found', 'Solicitud no encontrada');
    return request;
  }
}
