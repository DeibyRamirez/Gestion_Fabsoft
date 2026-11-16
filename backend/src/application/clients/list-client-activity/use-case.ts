import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { GetClientQuery } from '../get-client/ports.js';
import type { ClientActivityView } from '../shared/client-activity-view.js';
import type { ListClientActivityRepos } from './ports.js';

type ListClientActivityUow = ListClientActivityRepos & { clientDetail: GetClientQuery };

export class ListClientActivity {
  constructor(private readonly uow: UnitOfWork<ListClientActivityUow>) {}

  async execute(
    actor: UserActor,
    clientId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: ClientActivityView[]; total: number }> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, async ({ clientActivity, clientDetail }) => {
      const client = await clientDetail.findById(clientId);
      if (!client) throw new ApplicationError('not_found', 'Cliente no encontrado');
      return clientActivity.listForClient(clientId, page, pageSize);
    });
  }
}
