import type { RenewalRequestResolveInput } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, Clock, UnitOfWork } from '../../shared/ports.js';
import type { RenewalRequestView } from '../list-renewal-requests/ports.js';
import type { ResolveRenewalRequestRepos } from './ports.js';

type ResolveRenewalRequestUow = ResolveRenewalRequestRepos & { audit: AuditWriter };

const snapshot = (request: RenewalRequestView) => ({
  status: request.status,
  resolution: request.resolution,
  resolutionNote: request.resolutionNote,
  resolvedAt: request.resolvedAt?.toISOString() ?? null,
});

export class ResolveRenewalRequest {
  constructor(
    private readonly uow: UnitOfWork<ResolveRenewalRequestUow>,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: UserActor,
    id: string,
    input: RenewalRequestResolveInput,
  ): Promise<RenewalRequestView> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, async ({ renewalRequestResolve, audit }) => {
      const current = await renewalRequestResolve.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Solicitud no encontrada');
      if (current.status === 'resuelta') {
        throw new ApplicationError('invalid_state_transition', 'La solicitud ya fue resuelta');
      }
      if (input.resolution === 'renovada') {
        const confirmed = await renewalRequestResolve.hasConfirmedRenewalAfter(
          current.subscriptionId,
          current.createdAt,
        );
        if (!confirmed) {
          throw new ApplicationError(
            'renewal_not_confirmed',
            'No hay una renovación confirmada posterior a la solicitud',
          );
        }
      }

      const resolvedAt = this.clock.now();
      const updated = await renewalRequestResolve.resolve(id, {
        resolution: input.resolution,
        resolutionNote: input.resolutionNote ?? null,
        resolvedAt,
        resolvedBy: actor.userId,
      });
      if (!updated) {
        throw new ApplicationError('version_conflict', 'La solicitud fue modificada');
      }

      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'renewal_request.resolved',
        resourceType: 'renewal_request',
        resourceId: id,
        changes: { before: snapshot(current), after: snapshot(updated) },
        requestId: actor.requestId,
      });
      return updated;
    });
  }
}
