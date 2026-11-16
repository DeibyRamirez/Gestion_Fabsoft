import type { FollowUpStatus } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import { subscriptionAuditSnapshot } from '../shared/subscription-audit.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { UpdateSubscriptionRepos } from './ports.js';

type UpdateSubscriptionUow = UpdateSubscriptionRepos & { audit: AuditWriter };

export interface UpdateSubscriptionInput {
  version: number;
  contractReference?: string | null | undefined;
  renewalTerms?: string | null | undefined;
  isRenewable?: boolean | undefined;
  visibleInPortal?: boolean | undefined;
  ownerUserId?: string | null | undefined;
  notes?: string | null | undefined;
  followUpStatus?: FollowUpStatus | undefined;
  priceAmount?: number | undefined;
  supplierCostAmount?: number | null | undefined;
  changeReason?: string | undefined;
}

function hasPricingChange(input: UpdateSubscriptionInput): boolean {
  return input.priceAmount !== undefined || input.supplierCostAmount !== undefined;
}

/** PATCH de campos no estructurales; precio/costo sólo admin y con motivo (bloqueo optimista). */
export class UpdateSubscription {
  constructor(private readonly uow: UnitOfWork<UpdateSubscriptionUow>) {}

  async execute(
    actor: UserActor,
    id: string,
    input: UpdateSubscriptionInput,
  ): Promise<SubscriptionView> {
    requireRole(actor, 'admin', 'operator');
    if (hasPricingChange(input) && actor.role !== 'admin') {
      throw new ApplicationError('forbidden', 'Sólo un admin puede cambiar precio o costo');
    }
    if (hasPricingChange(input) && !input.changeReason) {
      throw new ApplicationError(
        'validation_error',
        'changeReason es obligatorio si cambia precio o costo',
      );
    }

    return this.uow.run(actor, async ({ subscriptionUpdate, audit }) => {
      const current = await subscriptionUpdate.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Suscripción no encontrada');
      if (current.version !== input.version) {
        throw new ApplicationError('version_conflict', 'La suscripción fue modificada');
      }

      const updated = await subscriptionUpdate.save(
        id,
        current.version,
        {
          ...(input.contractReference !== undefined
            ? { contractReference: input.contractReference }
            : {}),
          ...(input.renewalTerms !== undefined ? { renewalTerms: input.renewalTerms } : {}),
          ...(input.isRenewable !== undefined ? { isRenewable: input.isRenewable } : {}),
          ...(input.visibleInPortal !== undefined
            ? { visibleInPortal: input.visibleInPortal }
            : {}),
          ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.followUpStatus !== undefined ? { followUpStatus: input.followUpStatus } : {}),
          ...(input.priceAmount !== undefined ? { priceAmount: input.priceAmount } : {}),
          ...(input.supplierCostAmount !== undefined
            ? { supplierCostAmount: input.supplierCostAmount }
            : {}),
        },
        actor.userId,
      );
      if (!updated) throw new ApplicationError('version_conflict', 'La suscripción fue modificada');

      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: hasPricingChange(input) ? 'subscription.price_changed' : 'subscription.updated',
        resourceType: 'subscription',
        resourceId: id,
        changes: {
          before: subscriptionAuditSnapshot(current),
          after: subscriptionAuditSnapshot(updated),
        },
        requestId: actor.requestId,
      });
      return updated;
    });
  }
}
