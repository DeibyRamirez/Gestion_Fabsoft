import type { ClientView } from '../shared/client-view.js';

export interface ReactivateClientRepository {
  loadForUpdate(id: string): Promise<ClientView | null>;
  reactivate(id: string, updatedBy: string): Promise<ClientView>;
}

export interface ReactivateClientRepos {
  clientReactivate: ReactivateClientRepository;
}