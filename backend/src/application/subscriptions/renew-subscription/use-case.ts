import type { BillingCycle, PaymentStatus } from '@fabsoft/shared';
import type { AlertSchedulingRepos } from '../../alerts/shared/alert-scheduling.js';
import type { RenewalRequestAutomationRepos } from '../../renewal-requests/shared/renewal-request-automation.js';
import type { TaskAutomationRepos } from '../../tasks/shared/task-automation.js';
import { toBogotaLocalDate } from '../../../domain/subscriptions/bogota-date.js';
import { resolveRenewal } from '../../../domain/subscriptions/subscription.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, Clock, UnitOfWork } from '../../shared/ports.js';
import { subscriptionAuditSnapshot } from '../shared/subscription-audit.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { RenewSubscriptionRepos } from './ports.js';

type RenewSubscriptionUow = RenewSubscriptionRepos &
  AlertSchedulingRepos &
  TaskAutomationRepos &
  RenewalRequestAutomationRepos & { audit: AuditWriter };

export interface RenewSubscriptionInput {
  version: number;
  newPeriod: {
    startDate?: string | undefined;
    endDate?: string | undefined;
    billingCycle?: BillingCycle | undefined;
    customCycleMonths?: number | null | undefined;
    priceAmount: number;
    supplierCostAmount?: number | null | undefined;
    contractReference?: string | null | undefined;
    paymentStatus?: PaymentStatus | undefined;
  };
  note?: string | null | undefined;
}

const RENEWABLE_STATUSES = new Set(['activa', 'en_renovacion', 'vencida']);

/** Renovación mínima de HU-07: nuevo periodo en `fin anterior + 1`, sin solapes (RN-04). */
export class RenewSubscription {
  constructor(
    private readonly uow: UnitOfWork<RenewSubscriptionUow>,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: UserActor,
    id: string,
    input: RenewSubscriptionInput,
  ): Promise<SubscriptionView> {
    requireRole(actor, 'admin', 'operator');
    if (input.newPeriod.supplierCostAmount != null && actor.role !== 'admin') {
      throw new ApplicationError('forbidden', 'Sólo un admin puede fijar el costo del proveedor');
    }

    return this.uow.run(
      actor,
      async ({ subscriptionRenew, alerts, tasksAutomation, renewalRequests, audit }) => {
        const current = await subscriptionRenew.loadForUpdate(id);
        if (!current) throw new ApplicationError('not_found', 'Suscripción no encontrada');
        if (current.version !== input.version) {
          throw new ApplicationError('version_conflict', 'La suscripción fue modificada');
        }
        if (!RENEWABLE_STATUSES.has(current.status)) {
          throw new ApplicationError(
            'invalid_state_transition',
            'Sólo se renueva una suscripción vigente (activada)',
          );
        }

        const period = resolveRenewal({
          currentPeriodEnd: current.currentPeriodEnd,
          currentBillingCycle: current.billingCycle,
          currentCustomCycleMonths: current.customCycleMonths,
          ...(input.newPeriod.startDate !== undefined
            ? { newStartDate: input.newPeriod.startDate }
            : {}),
          ...(input.newPeriod.endDate !== undefined ? { newEndDate: input.newPeriod.endDate } : {}),
          ...(input.newPeriod.billingCycle !== undefined
            ? { billingCycle: input.newPeriod.billingCycle }
            : {}),
          ...(input.newPeriod.customCycleMonths !== undefined
            ? { customCycleMonths: input.newPeriod.customCycleMonths }
            : {}),
        });

        const updated = await subscriptionRenew.renew(
          id,
          current.version,
          {
            startDate: period.startDate,
            endDate: period.endDate,
            billingCycle: period.billingCycle,
            customCycleMonths: period.customCycleMonths,
            priceAmount: input.newPeriod.priceAmount,
            supplierCostAmount: input.newPeriod.supplierCostAmount ?? null,
            contractReference: input.newPeriod.contractReference ?? current.contractReference,
            paymentStatus: input.newPeriod.paymentStatus ?? 'pendiente',
            confirmedAt: this.clock.now(),
          },
          actor.userId,
        );
        if (!updated)
          throw new ApplicationError('version_conflict', 'La suscripción fue modificada');

        await alerts.cancelPendingForPeriod(id, current.currentPeriodEnd, 'renewed');
        await tasksAutomation.completeAutoTasksForSubscription(
          id,
          'Renovación confirmada',
          actor.userId,
        );
        await renewalRequests.resolveOpenForSubscription(
          id,
          'renovada',
          'Renovación confirmada',
          actor.userId,
        );
        await alerts.scheduleForPeriod(id, toBogotaLocalDate(this.clock.now()));

        await audit.write({
          actor: { type: 'user', userId: actor.userId },
          action: 'subscription.renewed',
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
