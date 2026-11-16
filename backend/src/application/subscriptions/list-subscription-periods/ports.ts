import type { SubscriptionPeriodView } from '../shared/subscription-view.js';

export interface ListSubscriptionPeriodsQuery {
  list(subscriptionId: string): Promise<SubscriptionPeriodView[]>;
}

export interface ListSubscriptionPeriodsRepos {
  subscriptionPeriods: ListSubscriptionPeriodsQuery;
}
