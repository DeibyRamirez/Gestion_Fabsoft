import type { PortalSubscriptionListQuery } from '@fabsoft/shared';
import type { PortalSubscriptionView } from '../shared/portal-views.js';

export interface PortalSubscriptionListRepository {
  list(
    clientId: string,
    query: PortalSubscriptionListQuery,
  ): Promise<{ items: PortalSubscriptionView[]; total: number }>;
}

export interface ListPortalSubscriptionsRepos {
  portalSubscriptions: PortalSubscriptionListRepository;
}
