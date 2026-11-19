import { ActivateSubscription } from '../../application/subscriptions/activate-subscription/use-case.js';
import { CancelSubscription } from '../../application/subscriptions/cancel-subscription/use-case.js';
import { CorrectExpiration } from '../../application/subscriptions/correct-expiration/use-case.js';
import { CreateSubscription } from '../../application/subscriptions/create-subscription/use-case.js';
import { GetSubscription } from '../../application/subscriptions/get-subscription/use-case.js';
import { ListSubscriptionPeriods } from '../../application/subscriptions/list-subscription-periods/use-case.js';
import { ListSubscriptions } from '../../application/subscriptions/list-subscriptions/use-case.js';
import { MarkNotRenewed } from '../../application/subscriptions/mark-not-renewed/use-case.js';
import { RenewSubscription } from '../../application/subscriptions/renew-subscription/use-case.js';
import { StartRenewal } from '../../application/subscriptions/start-renewal/use-case.js';
import { UpdatePeriodPayment } from '../../application/subscriptions/update-period-payment/use-case.js';
import { UpdateSubscription } from '../../application/subscriptions/update-subscription/use-case.js';
import type { Infra } from '../infra.js';

export function subscriptionsModule(infra: Infra) {
  return {
    listSubscriptions: new ListSubscriptions(infra.userUow),
    getSubscription: new GetSubscription(infra.userUow),
    createSubscription: new CreateSubscription(infra.userUow),
    activateSubscription: new ActivateSubscription(infra.userUow, infra.clock),
    updateSubscription: new UpdateSubscription(infra.userUow, infra.clock),
    cancelSubscription: new CancelSubscription(infra.userUow, infra.clock),
    renewSubscription: new RenewSubscription(infra.userUow, infra.clock),
    startSubscriptionRenewal: new StartRenewal(infra.userUow),
    markSubscriptionNotRenewed: new MarkNotRenewed(infra.userUow, infra.clock),
    correctSubscriptionExpiration: new CorrectExpiration(infra.userUow, infra.clock),
    updateSubscriptionPeriodPayment: new UpdatePeriodPayment(infra.userUow),
    listSubscriptionPeriods: new ListSubscriptionPeriods(infra.userUow),
  };
}
