import type { RenewalRequestResolution } from '@fabsoft/shared';

/** Resolución automática de solicitudes al renovar, no renovar o cancelar (RN-09). */
export interface RenewalRequestAutomation {
  resolveOpenForSubscription(
    subscriptionId: string,
    resolution: RenewalRequestResolution,
    resolutionNote: string,
    resolvedBy: string,
  ): Promise<number>;
}

export interface RenewalRequestAutomationRepos {
  renewalRequests: RenewalRequestAutomation;
}
