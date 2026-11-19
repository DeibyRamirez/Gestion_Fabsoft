import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import { subscriptionAuditSnapshot } from '../shared/subscription-audit.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { StartRenewalRepos } from './ports.js';

type StartRenewalUow = StartRenewalRepos & { audit: AuditWriter };

/** `active → in_renewal` y seguimiento `in_progress` (HU-09). */
export class StartRenewal {
  constructor(private readonly uow: UnitOfWork<StartRenewalUow>) {}

  async execute(actor: UserActor, id: string, version: number): Promise<SubscriptionView> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, async ({ subscriptionStartRenewal, audit }) => {
      const current = await subscriptionStartRenewal.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Suscripción no encontrada');
      if (current.version !== version) {
        throw new ApplicationError('version_conflict', 'La suscripción fue modificada');
      }
      if (current.status !== 'active') {
        throw new ApplicationError(
          'invalid_state_transition',
          'Sólo se inicia la renovación de una suscripción activa',
        );
      }

      const updated = await subscriptionStartRenewal.startRenewal(
        id,
        current.version,
        actor.userId,
      );
      if (!updated) throw new ApplicationError('version_conflict', 'La suscripción fue modificada');

      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'subscription.renewal_started',
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
