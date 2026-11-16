import type { FollowUpStatus } from '@fabsoft/shared';
import type { SubscriptionView } from '../shared/subscription-view.js';

export interface SubscriptionPatch {
  contractReference?: string | null;
  renewalTerms?: string | null;
  isRenewable?: boolean;
  visibleInPortal?: boolean;
  ownerUserId?: string | null;
  notes?: string | null;
  followUpStatus?: FollowUpStatus;
  priceAmount?: number;
  supplierCostAmount?: number | null;
}

export interface UpdateSubscriptionRepository {
  loadForUpdate(id: string): Promise<SubscriptionView | null>;
  save(
    id: string,
    expectedVersion: number,
    patch: SubscriptionPatch,
    updatedBy: string,
  ): Promise<SubscriptionView | null>;
}

export interface UpdateSubscriptionRepos {
  subscriptionUpdate: UpdateSubscriptionRepository;
}
