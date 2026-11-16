import { ActivateSubscription } from '../../application/subscriptions/activate-subscription/use-case.js';
import { CancelSubscription } from '../../application/subscriptions/cancel-subscription/use-case.js';
import { CreateSubscription } from '../../application/subscriptions/create-subscription/use-case.js';
import { GetSubscription } from '../../application/subscriptions/get-subscription/use-case.js';
import { ListSubscriptionPeriods } from '../../application/subscriptions/list-subscription-periods/use-case.js';
import { ListSubscriptions } from '../../application/subscriptions/list-subscriptions/use-case.js';
import { RenewSubscription } from '../../application/subscriptions/renew-subscription/use-case.js';
import { UpdateSubscription } from '../../application/subscriptions/update-subscription/use-case.js';
import type { Infra } from '../infra.js';

export function subscriptionsModule(infra: Infra) {
  return {
    listSubscriptions: new ListSubscriptions(infra.userUow),
    getSubscription: new GetSubscription(infra.userUow),
    createSubscription: new CreateSubscription(infra.userUow),
    activateSubscription: new ActivateSubscription(infra.userUow),
    updateSubscription: new UpdateSubscription(infra.userUow),
    cancelSubscription: new CancelSubscription(infra.userUow, infra.clock),
    renewSubscription: new RenewSubscription(infra.userUow, infra.clock),
    listSubscriptionPeriods: new ListSubscriptionPeriods(infra.userUow),
  };
}
