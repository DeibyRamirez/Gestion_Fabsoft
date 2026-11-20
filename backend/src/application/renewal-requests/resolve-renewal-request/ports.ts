import type { RenewalRequestResolution } from '@fabsoft/shared';
import type { RenewalRequestView } from '../list-renewal-requests/ports.js';

export interface ResolveRenewalRequestParams {
  resolution: RenewalRequestResolution;
  resolutionNote: string | null;
  resolvedAt: Date;
  resolvedBy: string;
}

export interface RenewalRequestResolveRepository {
  loadForUpdate(id: string): Promise<RenewalRequestView | null>;
  hasConfirmedRenewalAfter(subscriptionId: string, since: Date): Promise<boolean>;
  resolve(id: string, params: ResolveRenewalRequestParams): Promise<RenewalRequestView | null>;
}

export interface ResolveRenewalRequestRepos {
  renewalRequestResolve: RenewalRequestResolveRepository;
}
