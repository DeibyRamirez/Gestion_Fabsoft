/** Resolución automática de solicitudes al confirmar la renovación (RN-09). */
export interface RenewalRequestAutomation {
  resolveOpenForSubscription(
    subscriptionId: string,
    resolutionNote: string,
    resolvedBy: string,
  ): Promise<number>;
}

export interface RenewalRequestAutomationRepos {
  renewalRequests: RenewalRequestAutomation;
}
