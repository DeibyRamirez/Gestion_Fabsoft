import type { PortalRenewalRequestListQuery } from '@fabsoft/shared';
import type { PortalRenewalRequestView } from '../shared/portal-views.js';

export interface PortalRenewalRequestListRepository {
  list(
    clientId: string,
    query: PortalRenewalRequestListQuery,
  ): Promise<{ items: PortalRenewalRequestView[]; total: number }>;
}

export interface ListPortalRenewalRequestsRepos {
  portalRenewalRequests: PortalRenewalRequestListRepository;
}
