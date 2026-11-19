import type { SubscriptionStatus } from '@fabsoft/shared';
import type { SubscriptionView } from '../shared/subscription-view.js';

export interface MarkNotRenewedParams {
  periodId: string;
  reason: string;
  immediateStatus: Extract<SubscriptionStatus, 'not_renewed'> | null;
  confirmedAt: Date;
}

export interface MarkNotRenewedRepository {
  loadForUpdate(id: string): Promise<SubscriptionView | null>;
  markNotRenewed(
    id: string,
    expectedVersion: number,
    params: MarkNotRenewedParams,
    updatedBy: string,
  ): Promise<SubscriptionView | null>;
}

export interface MarkNotRenewedRepos {
  subscriptionMarkNotRenewed: MarkNotRenewedRepository;
}
