import type { SubscriptionView } from '../shared/subscription-view.js';

export interface CancelSubscriptionRepository {
  loadForUpdate(id: string): Promise<SubscriptionView | null>;
  cancel(
    id: string,
    expectedVersion: number,
    reason: string,
    cancelledAt: Date,
    updatedBy: string,
  ): Promise<SubscriptionView | null>;
}

export interface CancelSubscriptionRepos {
  subscriptionCancel: CancelSubscriptionRepository;
}
