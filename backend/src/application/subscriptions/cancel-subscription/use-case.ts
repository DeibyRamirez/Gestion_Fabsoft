import type { SubscriptionCancelInput } from '@fabsoft/shared';
import type { AlertSchedulingRepos } from '../../alerts/shared/alert-scheduling.js';
import type { RenewalRequestAutomationRepos } from '../../renewal-requests/shared/renewal-request-automation.js';
import type { TaskAutomationRepos } from '../../tasks/shared/task-automation.js';
import { assertTransition } from '../../../domain/subscriptions/subscription-status.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, Clock, UnitOfWork } from '../../shared/ports.js';
import { subscriptionAuditSnapshot } from '../shared/subscription-audit.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { CancelSubscriptionRepos } from './ports.js';

type CancelSubscriptionUow = CancelSubscriptionRepos &
  AlertSchedulingRepos &
  TaskAutomationRepos &
  RenewalRequestAutomationRepos & { audit: AuditWriter };

/** Cancelación terminal: sólo admin (matriz de permisos). */
export class CancelSubscription {
  constructor(
    private readonly uow: UnitOfWork<CancelSubscriptionUow>,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: UserActor,
    id: string,
    input: SubscriptionCancelInput,
  ): Promise<SubscriptionView> {
    requireRole(actor, 'admin');
    return this.uow.run(
      actor,
      async ({ subscriptionCancel, alerts, tasksAutomation, renewalRequests, audit }) => {
        const current = await subscriptionCancel.loadForUpdate(id);
        if (!current) throw new ApplicationError('not_found', 'Suscripción no encontrada');
        if (current.version !== input.version) {
          throw new ApplicationError('version_conflict', 'La suscripción fue modificada');
        }
        assertTransition(current.status, 'cancelada');
        const cancelledAt = this.clock.now();
        const updated = await subscriptionCancel.cancel(
          id,
          current.version,
          input.reason,
          cancelledAt,
          actor.userId,
        );
        if (!updated)
          throw new ApplicationError('version_conflict', 'La suscripción fue modificada');
        await alerts.cancelAllPending(id, 'subscription_cancelled');
        await tasksAutomation.cancelOpenTasksForSubscription(
          id,
          'Suscripción cancelada',
          actor.userId,
        );
        await renewalRequests.resolveOpenForSubscription(
          id,
          'otra',
          'Suscripción cancelada',
          actor.userId,
        );
        await audit.write({
          actor: { type: 'user', userId: actor.userId },
          action: 'subscription.cancelled',
          resourceType: 'subscription',
          resourceId: id,
          changes: {
            before: subscriptionAuditSnapshot(current),
            after: subscriptionAuditSnapshot(updated),
          },
          requestId: actor.requestId,
        });
        return updated;
      },
    );
  }
}
