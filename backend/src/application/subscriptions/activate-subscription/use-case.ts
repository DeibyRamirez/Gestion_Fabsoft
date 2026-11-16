import { assertTransition } from '../../../domain/subscriptions/subscription-status.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import { subscriptionAuditSnapshot } from '../shared/subscription-audit.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { ActivateSubscriptionRepos } from './ports.js';

type ActivateSubscriptionUow = ActivateSubscriptionRepos & { audit: AuditWriter };

export class ActivateSubscription {
  constructor(private readonly uow: UnitOfWork<ActivateSubscriptionUow>) {}

  async execute(actor: UserActor, id: string, version: number): Promise<SubscriptionView> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, async ({ subscriptionActivate, audit }) => {
      const current = await subscriptionActivate.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Suscripción no encontrada');
      if (current.version !== version) {
        throw new ApplicationError('version_conflict', 'La suscripción fue modificada');
      }
      assertTransition(current.status, 'active');
      const updated = await subscriptionActivate.activate(id, current.version, actor.userId);
      if (!updated) throw new ApplicationError('version_conflict', 'La suscripción fue modificada');
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'subscription.activated',
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
