import type { SubscriptionView } from '../shared/subscription-view.js';

export interface StartRenewalRepository {
  loadForUpdate(id: string): Promise<SubscriptionView | null>;
  startRenewal(
    id: string,
    expectedVersion: number,
    updatedBy: string,
  ): Promise<SubscriptionView | null>;
}

export interface StartRenewalRepos {
  subscriptionStartRenewal: StartRenewalRepository;
}
