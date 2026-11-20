import type { ClientOwnerCandidate } from '@fabsoft/shared';

export interface ListClientOwnerCandidatesQuery {
  list(): Promise<ClientOwnerCandidate[]>;
}

export interface ListClientOwnerCandidatesRepos {
  clientOwnerCandidates: ListClientOwnerCandidatesQuery;
}
