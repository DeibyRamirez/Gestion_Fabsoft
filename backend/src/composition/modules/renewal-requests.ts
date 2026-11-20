import { GetRenewalRequest } from '../../application/renewal-requests/get-renewal-request/use-case.js';
import { ListRenewalRequests } from '../../application/renewal-requests/list-renewal-requests/use-case.js';
import { ResolveRenewalRequest } from '../../application/renewal-requests/resolve-renewal-request/use-case.js';
import { UpdateRenewalRequest } from '../../application/renewal-requests/update-renewal-request/use-case.js';
import type { Infra } from '../infra.js';

export function renewalRequestsModule(infra: Infra) {
  return {
    listRenewalRequests: new ListRenewalRequests(infra.userUow),
    getRenewalRequest: new GetRenewalRequest(infra.userUow),
    updateRenewalRequest: new UpdateRenewalRequest(infra.userUow),
    resolveRenewalRequest: new ResolveRenewalRequest(infra.userUow, infra.clock),
  };
}
