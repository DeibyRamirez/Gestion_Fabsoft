import type {
  BillingCycle,
  FollowUpStatus,
  PaymentStatus,
  RenewalOutcome,
  SubscriptionStatus,
} from '@fabsoft/shared';
import type { LocalDate } from '../../../domain/subscriptions/local-date.js';

export interface SubscriptionClientRef {
  id: string;
  legalName: string;
}

export interface SubscriptionProductRef {
  id: string;
  name: string;
}

export interface SubscriptionOwnerRef {
  id: string;
  fullName: string;
}

export interface SubscriptionPeriodView {
  id: string;
  periodNumber: number;
  startDate: LocalDate;
  endDate: LocalDate;
  billingCycle: BillingCycle;
  priceAmount: number;
  currency: 'COP';
  renewalOutcome: RenewalOutcome;
  outcomeReason: string | null;
  paymentStatus: PaymentStatus;
  confirmedAt: Date | null;
  confirmedBy: SubscriptionOwnerRef | null;
  contractReference: string | null;
}

/** Proyección de suscripción para aplicación/API (docs/api/openapi.yaml Subscription). */
export interface SubscriptionView {
  id: string;
  clientId: string;
  productId: string;
  client: SubscriptionClientRef;
  product: SubscriptionProductRef;
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
  followUpStatus: FollowUpStatus;
  visibleInPortal: boolean;
  ownerUserId: string | null;
  owner: SubscriptionOwnerRef | null;
  notes: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  version: number;
  currentPeriod: SubscriptionPeriodView | null;
  createdAt: Date;
  updatedAt: Date;
}
