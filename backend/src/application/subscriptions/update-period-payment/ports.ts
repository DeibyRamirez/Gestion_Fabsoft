import type { PaymentStatus } from '@fabsoft/shared';
import type { SubscriptionPeriodView } from '../shared/subscription-view.js';

export interface PeriodPaymentPatch {
  paymentStatus?: PaymentStatus | undefined;
  contractReference?: string | null | undefined;
}

export interface UpdatePeriodPaymentRepository {
  loadPeriodForUpdate(
    subscriptionId: string,
    periodId: string,
  ): Promise<SubscriptionPeriodView | null>;
  updatePayment(
    subscriptionId: string,
    periodId: string,
    patch: PeriodPaymentPatch,
    updatedBy: string,
  ): Promise<SubscriptionPeriodView | null>;
}

export interface UpdatePeriodPaymentRepos {
  subscriptionPeriodPayment: UpdatePeriodPaymentRepository;
}
