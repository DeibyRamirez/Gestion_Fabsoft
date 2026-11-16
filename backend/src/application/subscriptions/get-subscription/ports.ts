import type { SubscriptionView } from '../shared/subscription-view.js';

export interface GetSubscriptionQuery {
  findById(id: string): Promise<SubscriptionView | null>;
}

export interface GetSubscriptionRepos {
  subscriptionDetail: GetSubscriptionQuery;
}
