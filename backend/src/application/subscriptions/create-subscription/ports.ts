import type { BillingCycle, PaymentStatus, SubscriptionStatus } from '@fabsoft/shared';
import type { LocalDate } from '../../../domain/subscriptions/local-date.js';
import type { SubscriptionView } from '../shared/subscription-view.js';

export interface NewSubscriptionRecord {
  clientId: string;
  productId: string;
  contractReference: string | null;
  startDate: LocalDate;
  currentPeriodEnd: LocalDate;
  billingCycle: BillingCycle;
  customCycleMonths: number | null;
  priceAmount: number;
  currency: 'COP';
  supplierCostAmount: number | null;
  renewalTerms: string | null;
  isRenewable: boolean;
  status: SubscriptionStatus;
  visibleInPortal: boolean;
  ownerUserId: string | null;
  notes: string | null;
  createdBy: string;
  initialPeriod: {
    periodNumber: number;
    startDate: LocalDate;
    endDate: LocalDate;
    billingCycle: BillingCycle;
    priceAmount: number;
    paymentStatus: PaymentStatus;
  };
}

export interface CreateSubscriptionRepository {
  /** Inserta la suscripción y su periodo 1 en la misma transacción. */
  insert(record: NewSubscriptionRecord): Promise<SubscriptionView>;
}

export interface CreateSubscriptionRepos {
  subscriptionCreate: CreateSubscriptionRepository;
}
