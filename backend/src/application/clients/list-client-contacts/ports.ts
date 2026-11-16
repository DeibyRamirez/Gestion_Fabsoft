import type { ClientContactView } from '../shared/client-contact-view.js';

export interface ListClientContactsQuery {
  list(clientId: string, includeArchived: boolean): Promise<ClientContactView[]>;
}

export interface ListClientContactsRepos {
  clientContactsList: ListClientContactsQuery;
}
