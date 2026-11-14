import type { ClientListQuery } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { ClientView } from '../shared/client-view.js';
import type { ListClientsRepos } from './ports.js';

export interface ClientListResult {
  items: ClientView[];
  page: number;
  pageSize: number;
  total: number;
}

export class ListClients {
  constructor(private readonly uow: UnitOfWork<ListClientsRepos>) {}

  async execute(actor: UserActor, query: ClientListQuery): Promise<ClientListResult> {
    requireRole(actor, 'admin', 'operator');
    const { items, total } = await this.uow.run(actor, ({ clientsList }) =>
      clientsList.list(query),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
