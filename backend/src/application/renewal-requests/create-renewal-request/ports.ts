import type { SubscriptionStatus } from '@fabsoft/shared';
import type { CreatedRenewalRequestView } from '../../portal/shared/portal-views.js';

export interface RequestableSubscription {
  id: string;
  clientId: string;
  productName: string;
  status: SubscriptionStatus;
}

export interface NewRenewalRequestRecord {
  subscriptionId: string;
  clientId: string;
  productName: string;
  requestedByUserId: string;
  comment: string | null;
}

export interface RenewalRequestCreateRepository {
  findForClient(clientId: string, subscriptionId: string): Promise<RequestableSubscription | null>;
  findForStaff(subscriptionId: string): Promise<RequestableSubscription | null>;
  insert(record: NewRenewalRequestRecord): Promise<CreatedRenewalRequestView>;
}

export interface CreateRenewalRequestRepos {
  renewalRequestCreate: RenewalRequestCreateRepository;
}
