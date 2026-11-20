import type { RenewalRequestStatus, SubscriptionStatus } from '@fabsoft/shared';
import type { SubscriptionPeriodView } from '../../subscriptions/shared/subscription-view.js';

export interface IntegrationPeriodsQuery {
  listPeriods(subscriptionId: string): Promise<SubscriptionPeriodView[]>;
}

export interface IntegrationPeriodsRepos {
  integrationPeriods: IntegrationPeriodsQuery;
}

export interface IntegrationRequestableSubscription {
  id: string;
  clientId: string;
  status: SubscriptionStatus;
}

export interface IntegrationRenewalRequestRecord {
  subscriptionId: string;
  clientId: string;
  requestedByIntegrationId: string;
  comment: string | null;
}

export interface CreatedIntegrationRenewalRequestView {
  id: string;
  subscriptionId: string;
  clientId: string;
  comment: string | null;
  status: RenewalRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  requestedBy: { actorType: 'integration'; id: string };
}

export interface IntegrationRenewalRequestRepository {
  findForIntegration(
    integrationId: string,
    subscriptionId: string,
  ): Promise<IntegrationRequestableSubscription | null>;
  insert(record: IntegrationRenewalRequestRecord): Promise<CreatedIntegrationRenewalRequestView>;
}

export interface CreateIntegrationRenewalRequestRepos {
  integrationRequestCreate: IntegrationRenewalRequestRepository;
}
