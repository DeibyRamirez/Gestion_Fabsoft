import type { ClientActivityView } from '../shared/client-activity-view.js';

export interface ListClientActivityRepository {
  listForClient(
    clientId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: ClientActivityView[]; total: number }>;
}

export interface ListClientActivityRepos {
  clientActivity: ListClientActivityRepository;
}
