import { GetRenewalRequest } from '../../application/renewal-requests/get-renewal-request/use-case.js';
import { ListRenewalRequests } from '../../application/renewal-requests/list-renewal-requests/use-case.js';
import type { Infra } from '../infra.js';

export function renewalRequestsModule(infra: Infra) {
  return {
    listRenewalRequests: new ListRenewalRequests(infra.userUow),
    getRenewalRequest: new GetRenewalRequest(infra.userUow),
  };
}
