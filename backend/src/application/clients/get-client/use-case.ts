import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { ClientView } from '../shared/client-view.js';
import type { GetClientRepos } from './ports.js';

export class GetClient {
  constructor(private readonly uow: UnitOfWork<GetClientRepos>) {}

  async execute(actor: UserActor, id: string): Promise<ClientView> {
    requireRole(actor, 'admin', 'operator');
    const client = await this.uow.run(actor, ({ clientDetail }) => clientDetail.findById(id));
    if (!client) throw new ApplicationError('not_found', 'Cliente no encontrado');
    return client;
  }
}
