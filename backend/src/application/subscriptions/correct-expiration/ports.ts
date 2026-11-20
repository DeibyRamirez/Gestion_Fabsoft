import type { LocalDate } from '../../../domain/subscriptions/local-date.js';
import type { SubscriptionView } from '../shared/subscription-view.js';

export interface CorrectExpirationParams {
  periodId: string;
  newCurrentPeriodEnd: LocalDate;
}

export interface CorrectExpirationRepository {
  loadForUpdate(id: string): Promise<SubscriptionView | null>;
  correctExpiration(
    id: string,
    expectedVersion: number,
    params: CorrectExpirationParams,
    updatedBy: string,
  ): Promise<SubscriptionView | null>;
}

export interface CorrectExpirationRepos {
  subscriptionCorrectExpiration: CorrectExpirationRepository;
}
