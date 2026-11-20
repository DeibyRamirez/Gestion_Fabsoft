import { ListRenewalRequests } from '../../application/renewal-requests/list-renewal-requests/use-case.js';
import type { Infra } from '../infra.js';

export function renewalRequestsModule(infra: Infra) {
  return {
    listRenewalRequests: new ListRenewalRequests(infra.userUow),
  };
}
