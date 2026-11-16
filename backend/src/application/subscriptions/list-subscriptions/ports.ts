import type { SubscriptionListQuery } from '@fabsoft/shared';
import type { SubscriptionView } from '../shared/subscription-view.js';

export interface ListSubscriptionsQuery {
  list(q: SubscriptionListQuery): Promise<{ items: SubscriptionView[]; total: number }>;
}

export interface ListSubscriptionsRepos {
  subscriptionsList: ListSubscriptionsQuery;
}
