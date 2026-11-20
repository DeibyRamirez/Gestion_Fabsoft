import type { PortalPeriodView, PortalSubscriptionView } from '../shared/portal-views.js';

export interface PortalPeriodsQuery {
  list(subscriptionId: string): Promise<PortalPeriodView[]>;
}

export interface ListPortalSubscriptionPeriodsRepos {
  portalSubscription: {
    findById(clientId: string, id: string): Promise<PortalSubscriptionView | null>;
  };
  portalPeriods: PortalPeriodsQuery;
}
