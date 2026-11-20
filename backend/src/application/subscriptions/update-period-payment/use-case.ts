import type { PeriodPaymentUpdateInput } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import { subscriptionPeriodAuditSnapshot } from '../shared/subscription-audit.js';
import type { SubscriptionPeriodView } from '../shared/subscription-view.js';
import type { UpdatePeriodPaymentRepos } from './ports.js';

type UpdatePeriodPaymentUow = UpdatePeriodPaymentRepos & { audit: AuditWriter };

/** Única vía para cambiar el pago de un periodo (RN-06/RN-07). */
export class UpdatePeriodPayment {
  constructor(private readonly uow: UnitOfWork<UpdatePeriodPaymentUow>) {}

  async execute(
    actor: UserActor,
    subscriptionId: string,
    periodId: string,
    input: PeriodPaymentUpdateInput,
  ): Promise<SubscriptionPeriodView> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, async ({ subscriptionPeriodPayment, audit }) => {
      const current = await subscriptionPeriodPayment.loadPeriodForUpdate(subscriptionId, periodId);
      if (!current) throw new ApplicationError('not_found', 'Periodo no encontrado');

      const updated = await subscriptionPeriodPayment.updatePayment(
        subscriptionId,
        periodId,
        input,
        actor.userId,
      );
      if (!updated) throw new ApplicationError('not_found', 'Periodo no encontrado');

      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'subscription_period.payment_updated',
        resourceType: 'subscription_period',
        resourceId: periodId,
        changes: {
          before: subscriptionPeriodAuditSnapshot(current),
          after: subscriptionPeriodAuditSnapshot(updated),
        },
        requestId: actor.requestId,
      });
      return updated;
    });
  }
}
