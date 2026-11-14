import type { ClientView } from '../shared/client-view.js';

export interface GetClientQuery {
  findById(id: string): Promise<ClientView | null>;
}

export interface GetClientRepos {
  clientDetail: GetClientQuery;
}