import type { PortalSubscriptionView } from '../shared/portal-views.js';

export interface PortalSubscriptionQuery {
  findById(clientId: string, id: string): Promise<PortalSubscriptionView | null>;
}

export interface GetPortalSubscriptionRepos {
  portalSubscription: PortalSubscriptionQuery;
}
