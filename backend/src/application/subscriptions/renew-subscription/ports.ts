import type { BillingCycle, PaymentStatus } from '@fabsoft/shared';
import type { LocalDate } from '../../../domain/subscriptions/local-date.js';
import type { SubscriptionView } from '../shared/subscription-view.js';

export interface RenewSubscriptionParams {
  startDate: LocalDate;
  endDate: LocalDate;
  billingCycle: BillingCycle;
  customCycleMonths: number | null;
  priceAmount: number;
  supplierCostAmount: number | null;
  contractReference: string | null;
  paymentStatus: PaymentStatus;
  confirmedAt: Date;
}

export interface RenewSubscriptionRepository {
  loadForUpdate(id: string): Promise<SubscriptionView | null>;
  renew(
    id: string,
    expectedVersion: number,
    params: RenewSubscriptionParams,
    updatedBy: string,
  ): Promise<SubscriptionView | null>;
}

export interface RenewSubscriptionRepos {
  subscriptionRenew: RenewSubscriptionRepository;
}
