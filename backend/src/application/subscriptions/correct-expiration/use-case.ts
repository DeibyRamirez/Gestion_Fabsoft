import type { CorrectExpirationInput } from '@fabsoft/shared';
import type { AlertSchedulingRepos } from '../../alerts/shared/alert-scheduling.js';
import type { TaskAutomationRepos } from '../../tasks/shared/task-automation.js';
import { toBogotaLocalDate } from '../../../domain/subscriptions/bogota-date.js';
import { resolveExpirationCorrection } from '../../../domain/subscriptions/subscription.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, Clock, UnitOfWork } from '../../shared/ports.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { CorrectExpirationRepos } from './ports.js';

type CorrectExpirationUow = CorrectExpirationRepos &
  AlertSchedulingRepos &
  TaskAutomationRepos & { audit: AuditWriter };

/** Corrige el fin del periodo vigente conservando el anterior en auditoría (Flujo E). */
export class CorrectExpiration {
  constructor(
    private readonly uow: UnitOfWork<CorrectExpirationUow>,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: UserActor,
    id: string,
    input: CorrectExpirationInput,
  ): Promise<SubscriptionView> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(
      actor,
      async ({ subscriptionCorrectExpiration, alerts, tasksAutomation, audit }) => {
        const current = await subscriptionCorrectExpiration.loadForUpdate(id);
        if (!current) throw new ApplicationError('not_found', 'Suscripción no encontrada');
        if (current.version !== input.version) {
          throw new ApplicationError('version_conflict', 'La suscripción fue modificada');
        }
        if (!['active', 'in_renewal', 'expired'].includes(current.status)) {
          throw new ApplicationError(
            'invalid_state_transition',
            'La suscripción no admite corrección de vencimiento',
          );
        }
        if (!current.currentPeriod) {
          throw new ApplicationError(
            'invalid_state_transition',
            'La suscripción no tiene un periodo vigente',
          );
        }

        const newCurrentPeriodEnd = resolveExpirationCorrection(
          current.currentPeriod.startDate,
          input.newCurrentPeriodEnd,
        );
        const updated = await subscriptionCorrectExpiration.correctExpiration(
          id,
          current.version,
          { periodId: current.currentPeriod.id, newCurrentPeriodEnd },
          actor.userId,
        );
        if (!updated)
          throw new ApplicationError('version_conflict', 'La suscripción fue modificada');

        await alerts.cancelPendingForPeriod(id, current.currentPeriodEnd, 'period_end_changed');
        await tasksAutomation.cancelPendingAutoTasksForPeriod(
          id,
          current.currentPeriodEnd,
          'Vencimiento corregido',
          actor.userId,
        );
        await tasksAutomation.annotateInProgressAutoTasksForPeriod(
          id,
          current.currentPeriodEnd,
          `Vencimiento corregido de ${current.currentPeriodEnd} a ${newCurrentPeriodEnd}: ${input.reason}`,
          actor.userId,
        );
        await alerts.scheduleForPeriod(id, toBogotaLocalDate(this.clock.now()));

        await audit.write({
          actor: { type: 'user', userId: actor.userId },
          action: 'subscription.expiration_corrected',
          resourceType: 'subscription',
          resourceId: id,
          changes: {
            before: { end_date: current.currentPeriodEnd },
            after: { end_date: updated.currentPeriodEnd },
          },
          reason: input.reason,
          requestId: actor.requestId,
        });
        return updated;
      },
    );
  }
}
