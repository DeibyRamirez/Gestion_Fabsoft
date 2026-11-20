import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import { toMe } from '../../auth/get-me/use-case.js';
import type { PortalMeView } from '../shared/portal-views.js';
import type { GetPortalMeRepos } from './ports.js';

export class GetPortalMe {
  constructor(private readonly uow: UnitOfWork<GetPortalMeRepos>) {}

  async execute(actor: UserActor): Promise<PortalMeView> {
    requireRole(actor, 'client');
    if (!actor.clientId) throw new ApplicationError('forbidden', 'Usuario sin organización');
    const clientId = actor.clientId;
    const result = await this.uow.run(actor, async ({ me, portalMe }) => {
      const user = await me.findProfile(actor.userId);
      const organization = await portalMe.findOrganization(clientId);
      const contactChannel = await portalMe.findContactChannel();
      return { user, organization, contactChannel };
    });
    if (!result.user || !result.organization) {
      throw new ApplicationError('not_found', 'Organización no encontrada');
    }
    return {
      user: toMe(result.user),
      organization: result.organization,
      contactChannel: result.contactChannel,
    };
  }
}
