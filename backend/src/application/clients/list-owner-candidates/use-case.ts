import type { ClientOwnerCandidate } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { ListClientOwnerCandidatesRepos } from './ports.js';

export class ListClientOwnerCandidates {
  constructor(private readonly uow: UnitOfWork<ListClientOwnerCandidatesRepos>) {}

  async execute(actor: UserActor): Promise<ClientOwnerCandidate[]> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, ({ clientOwnerCandidates }) => clientOwnerCandidates.list());
  }
}
