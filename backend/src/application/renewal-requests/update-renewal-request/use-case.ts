import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { RenewalRequestView } from '../list-renewal-requests/ports.js';
import type { UpdateRenewalRequestRepos } from './ports.js';

type UpdateRenewalRequestUow = UpdateRenewalRequestRepos & { audit: AuditWriter };

const snapshot = (request: RenewalRequestView) => ({
  status: request.status,
  assignedUserId: request.assignedUser?.id ?? null,
  resolution: request.resolution,
  resolutionNote: request.resolutionNote,
});

export class UpdateRenewalRequest {
  constructor(private readonly uow: UnitOfWork<UpdateRenewalRequestUow>) {}

  async execute(
    actor: UserActor,
    id: string,
    input: { status?: 'en_progreso' | undefined; assignedUserId?: string | null | undefined },
  ): Promise<RenewalRequestView> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, async ({ renewalRequestUpdate, audit }) => {
      const current = await renewalRequestUpdate.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Solicitud no encontrada');
      if (current.status === 'resuelta') {
        throw new ApplicationError(
          'invalid_state_transition',
          'La solicitud ya fue resuelta y no se puede modificar',
        );
      }
      if (input.assignedUserId) {
        const user = await renewalRequestUpdate.findAssignableUser(input.assignedUserId);
        if (!user) throw new ApplicationError('not_found', 'Usuario responsable no encontrado');
      }

      const status =
        input.status ??
        (current.status === 'pendiente_revision' && input.assignedUserId
          ? 'en_progreso'
          : undefined);
      const updated = await renewalRequestUpdate.update(id, {
        ...(status !== undefined ? { status } : {}),
        ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId } : {}),
      });
      if (!updated) {
        throw new ApplicationError('version_conflict', 'La solicitud fue modificada');
      }

      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'renewal_request.updated',
        resourceType: 'renewal_request',
        resourceId: id,
        changes: { before: snapshot(current), after: snapshot(updated) },
        requestId: actor.requestId,
      });
      return updated;
    });
  }
}
