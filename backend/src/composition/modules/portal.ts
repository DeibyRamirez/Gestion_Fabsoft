import { CreateRenewalRequest } from '../../application/renewal-requests/create-renewal-request/use-case.js';
import { ProcessRenewalRequestCreated } from '../../application/renewal-requests/process-created/use-case.js';
import { GetPortalMe } from '../../application/portal/get-portal-me/use-case.js';
import { GetPortalRenewalRequest } from '../../application/portal/get-portal-renewal-request/use-case.js';
import { GetPortalSubscription } from '../../application/portal/get-portal-subscription/use-case.js';
import { ListPortalRenewalRequests } from '../../application/portal/list-portal-renewal-requests/use-case.js';
import { ListPortalSubscriptionPeriods } from '../../application/portal/list-portal-subscription-periods/use-case.js';
import { ListPortalSubscriptions } from '../../application/portal/list-portal-subscriptions/use-case.js';
import type { Infra } from '../infra.js';

export function portalModule(infra: Infra) {
  return {
    getPortalMe: new GetPortalMe(infra.userUow),
    listPortalSubscriptions: new ListPortalSubscriptions(infra.userUow),
    getPortalSubscription: new GetPortalSubscription(infra.userUow),
    listPortalSubscriptionPeriods: new ListPortalSubscriptionPeriods(infra.userUow),
    listPortalRenewalRequests: new ListPortalRenewalRequests(infra.userUow),
    getPortalRenewalRequest: new GetPortalRenewalRequest(infra.userUow),
    createRenewalRequest: new CreateRenewalRequest(infra.userUow),
    processRenewalRequestCreated: new ProcessRenewalRequestCreated(
      infra.workerUow,
      infra.clock,
    ),
  };
}
