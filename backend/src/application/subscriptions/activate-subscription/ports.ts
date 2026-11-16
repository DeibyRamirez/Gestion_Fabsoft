import type { SubscriptionView } from '../shared/subscription-view.js';

export interface ActivateSubscriptionRepository {
  loadForUpdate(id: string): Promise<SubscriptionView | null>;
  activate(
    id: string,
    expectedVersion: number,
    updatedBy: string,
  ): Promise<SubscriptionView | null>;
}

export interface ActivateSubscriptionRepos {
  subscriptionActivate: ActivateSubscriptionRepository;
}
