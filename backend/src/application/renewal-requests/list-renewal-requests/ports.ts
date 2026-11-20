import type {
  RenewalRequestListQuery,
  RenewalRequestResolution,
  RenewalRequestStatus,
} from '@fabsoft/shared';

export interface RenewalRequestRequestedByView {
  actorType: 'user' | 'integration';
  id: string;
  name?: string;
}

export interface RenewalRequestView {
  id: string;
  subscriptionId: string;
  clientId: string;
  requestedBy: RenewalRequestRequestedByView;
  comment: string | null;
  status: RenewalRequestStatus;
  assignedUser: { id: string; fullName: string } | null;
  resolution: RenewalRequestResolution | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListRenewalRequestsQuery {
  list(query: RenewalRequestListQuery): Promise<{ items: RenewalRequestView[]; total: number }>;
}

export interface ListRenewalRequestsRepos {
  renewalRequestsList: ListRenewalRequestsQuery;
}
