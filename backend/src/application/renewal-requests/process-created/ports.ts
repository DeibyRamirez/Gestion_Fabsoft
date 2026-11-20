export interface RenewalRequestProcessContext {
  requestId: string;
  subscriptionId: string;
  clientId: string;
  clientLegalName: string;
  productName: string;
  comment: string | null;
  assigneeUserId: string | null;
  adminIds: string[];
}

export interface RenewalRequestFollowUp {
  taskId: string | null;
  notifications: number;
}

export interface RenewalRequestProcessRepository {
  findContext(requestId: string): Promise<RenewalRequestProcessContext | null>;
  createFollowUp(
    context: RenewalRequestProcessContext,
    dueDate: string,
  ): Promise<RenewalRequestFollowUp>;
}

export interface ProcessRenewalRequestRepos {
  renewalRequestProcess: RenewalRequestProcessRepository;
}
