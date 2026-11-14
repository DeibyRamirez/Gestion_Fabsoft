import type { ClientUpdateInput } from '@fabsoft/shared';
import { isArchived } from '../../../domain/clients/client.js';
import { normalizeTaxId } from '../../../domain/clients/tax-id.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { GetUserQuery } from '../../users/get-user/ports.js';
import { clientAuditSnapshot } from '../shared/client-audit.js';
import { clientTaxIdTakenError } from '../shared/client-errors.js';
import type { ClientView } from '../shared/client-view.js';
import { assertInternalOwner } from '../shared/owner-validation.js';
import type { UpdateClientRepos } from './ports.js';

type UpdateClientUow = UpdateClientRepos & { audit: AuditWriter; userDetail: GetUserQuery };

export class UpdateClient {
  constructor(private readonly uow: UnitOfWork<UpdateClientUow>) {}

  async execute(actor: UserActor, id: string, input: ClientUpdateInput): Promise<ClientView> {
    requireRole(actor, 'admin', 'operator');
    if (
      input.taxId !== undefined &&
      input.taxId !== null &&
      normalizeTaxId(input.taxId).length === 0
    ) {
      throw new ApplicationError('validation_error', 'Identificación fiscal inválida');
    }
    return this.uow.run(actor, async ({ clientUpdate, audit, userDetail }) => {
      const current = await clientUpdate.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Cliente no encontrado');
      if (isArchived(current.status)) {
        throw new ApplicationError('client_archived', 'No se puede editar un cliente archivado');
      }
      await assertInternalOwner(userDetail, input.ownerUserId);
      const outcome = await clientUpdate.save(id, {
        ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
        ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedBy: actor.userId,
      });
      if (!outcome.ok) throw clientTaxIdTakenError(outcome.conflict);
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'client.updated',
        resourceType: 'client',
        resourceId: id,
        changes: {
          before: clientAuditSnapshot(current),
          after: clientAuditSnapshot(outcome.client),
        },
        requestId: actor.requestId,
      });
      return outcome.client;
    });
  }
}
