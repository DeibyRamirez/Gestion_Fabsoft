import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { GetClientQuery } from '../get-client/ports.js';
import type { ClientContactView } from '../shared/client-contact-view.js';
import type { ListClientContactsRepos } from './ports.js';

type ListClientContactsUow = ListClientContactsRepos & { clientDetail: GetClientQuery };

export class ListClientContacts {
  constructor(private readonly uow: UnitOfWork<ListClientContactsUow>) {}

  async execute(
    actor: UserActor,
    clientId: string,
    includeArchived: boolean,
  ): Promise<ClientContactView[]> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, async ({ clientContactsList, clientDetail }) => {
      const client = await clientDetail.findById(clientId);
      if (!client) throw new ApplicationError('not_found', 'Cliente no encontrado');
      return clientContactsList.list(clientId, includeArchived);
    });
  }
}
