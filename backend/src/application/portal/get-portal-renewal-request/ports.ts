import type { PortalRenewalRequestView } from '../shared/portal-views.js';

export interface PortalRenewalRequestQuery {
  findById(clientId: string, id: string): Promise<PortalRenewalRequestView | null>;
}

export interface GetPortalRenewalRequestRepos {
  portalRenewalRequest: PortalRenewalRequestQuery;
}
