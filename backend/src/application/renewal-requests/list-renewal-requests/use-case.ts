import type { RenewalRequestListQuery } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { ListRenewalRequestsRepos, RenewalRequestView } from './ports.js';

export class ListRenewalRequests {
  constructor(private readonly uow: UnitOfWork<ListRenewalRequestsRepos>) {}

  async execute(
    actor: UserActor,
    query: RenewalRequestListQuery,
  ): Promise<{ items: RenewalRequestView[]; total: number }> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, ({ renewalRequestsList }) => renewalRequestsList.list(query));
  }
}
