import type { RenewalRequestView } from '../list-renewal-requests/ports.js';

export interface RenewalRequestUpdateParams {
  status?: 'en_progreso' | undefined;
  assignedUserId?: string | null | undefined;
}

export interface RenewalRequestUpdateRepository {
  loadForUpdate(id: string): Promise<RenewalRequestView | null>;
  findAssignableUser(id: string): Promise<{ id: string; fullName: string } | null>;
  update(id: string, params: RenewalRequestUpdateParams): Promise<RenewalRequestView | null>;
}

export interface UpdateRenewalRequestRepos {
  renewalRequestUpdate: RenewalRequestUpdateRepository;
}
