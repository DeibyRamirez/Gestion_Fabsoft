import type {
  BillingCycle,
  Me,
  RenewalOutcome,
  RenewalRequestResolution,
  RenewalRequestStatus,
  SubscriptionStatus,
} from '@fabsoft/shared';

export interface PortalContactChannelView {
  email: string | null;
  phone: string | null;
  hours: string | null;
}

export interface PortalOrganizationView {
  id: string;
  legalName: string;
  taxId: string | null;
}

export interface PortalMeView {
  user: Me;
  organization: PortalOrganizationView;
  contactChannel: PortalContactChannelView;
}

export interface PortalSubscriptionView {
  id: string;
  productName: string;
  contractReference: string | null;
  startDate: string;
  currentPeriodEnd: string;
  billingCycle: BillingCycle;
  priceAmount: number;
  currency: 'COP';
  status: SubscriptionStatus;
  renewalTerms: string | null;
  hasOpenRenewalRequest: boolean;
}

export interface PortalPeriodView {
  periodNumber: number;
  startDate: string;
  endDate: string;
  billingCycle: BillingCycle;
  priceAmount: number;
  currency: 'COP';
  renewalOutcome: RenewalOutcome;
}

export interface PortalRenewalRequestView {
  id: string;
  subscriptionId: string;
  productName: string | null;
  comment: string | null;
  status: RenewalRequestStatus;
  resolution: RenewalRequestResolution | null;
  resolutionNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface CreatedRenewalRequestView {
  id: string;
  subscriptionId: string;
  clientId: string;
  productName: string;
  comment: string | null;
  status: RenewalRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  requestedBy: { actorType: 'user'; id: string; name?: string };
}
