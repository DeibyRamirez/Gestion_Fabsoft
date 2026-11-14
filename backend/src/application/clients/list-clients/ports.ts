import type { ClientListQuery } from '@fabsoft/shared';
import type { ClientView } from '../shared/client-view.js';

export interface ListClientsQuery {
  list(q: ClientListQuery): Promise<{ items: ClientView[]; total: number }>;
}

export interface ListClientsRepos {
  clientsList: ListClientsQuery;
}