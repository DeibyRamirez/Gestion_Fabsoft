import type { SubscriptionNotRenewedInput } from '@fabsoft/shared';
import type { AlertSchedulingRepos } from '../../alerts/shared/alert-scheduling.js';
import type { RenewalRequestAutomationRepos } from '../../renewal-requests/shared/renewal-request-automation.js';
import type { TaskAutomationRepos } from '../../tasks/shared/task-automation.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, Clock, UnitOfWork } from '../../shared/ports.js';
import { subscriptionAuditSnapshot } from '../shared/subscription-audit.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { MarkNotRenewedRepos } from './ports.js';

type MarkNotRenewedUow = MarkNotRenewedRepos &
  AlertSchedulingRepos &
  TaskAutomationRepos &
  RenewalRequestAutomationRepos & { audit: AuditWriter };

/**
 * Registra la decisión de no renovar. Si sigue vigente, el estado se mantiene
 * hasta el vencimiento (RN-03/RN-05); si ya venció, pasa a `not_renewed`.
 */
export class MarkNotRenewed {
  constructor(
    private readonly uow: UnitOfWork<MarkNotRenewedUow>,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: UserActor,
    id: string,
    input: SubscriptionNotRenewedInput,
  ): Promise<SubscriptionView> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(
      actor,
      async ({ subscriptionMarkNotRenewed, alerts, tasksAutomation, renewalRequests, audit }) => {
        const current = await subscriptionMarkNotRenewed.loadForUpdate(id);
        if (!current) throw new ApplicationError('not_found', 'Suscripción no encontrada');
        if (current.version !== input.version) {
          throw new ApplicationError('version_conflict', 'La suscripción fue modificada');
        }
        if (!['activa', 'en_renovacion', 'vencida'].includes(current.status)) {
          throw new ApplicationError(
            'invalid_state_transition',
            'La suscripción no admite registrar no renovación',
          );
        }
        if (!current.currentPeriod) {
          throw new ApplicationError(
            'invalid_state_transition',
            'La suscripción no tiene un periodo vigente',
          );
        }
        if (
          current.currentPeriod.renewalOutcome === 'no_renovada' &&
          current.status !== 'vencida'
        ) {
          throw new ApplicationError(
            'invalid_state_transition',
            'La no renovación ya está registrada en el periodo vigente',
          );
        }

        const updated = await subscriptionMarkNotRenewed.markNotRenewed(
          id,
          current.version,
          {
            periodId: current.currentPeriod.id,
            reason: input.reason,
            immediateStatus: current.status === 'vencida' ? 'no_renovada' : null,
            confirmedAt: this.clock.now(),
          },
          actor.userId,
        );
        if (!updated)
          throw new ApplicationError('version_conflict', 'La suscripción fue modificada');

        await alerts.cancelPendingWithoutException(id, 'not_renewed');
        await tasksAutomation.cancelOpenAutoTasksForSubscription(
          id,
          `No renovación: ${input.reason}`,
          actor.userId,
        );
        await renewalRequests.resolveOpenForSubscription(
          id,
          'no_renovada',
          `No renovación: ${input.reason}`,
          actor.userId,
        );

        await audit.write({
          actor: { type: 'user', userId: actor.userId },
          action: 'subscription.not_renewed',
          resourceType: 'subscription',
          resourceId: id,
          changes: {
            before: subscriptionAuditSnapshot(current),
            after: subscriptionAuditSnapshot(updated),
          },
          reason: input.reason,
          requestId: actor.requestId,
        });
        return updated;
      },
    );
  }
}
