import type { ClientContactUpdateInput } from '@fabsoft/shared';
import {
  archivePrimaryBlocked,
  isContactReachable,
  resolveReactivationPrimary,
} from '../../../domain/clients/client-contact.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { GetClientQuery } from '../get-client/ports.js';
import { clientContactAuditSnapshot } from '../shared/client-contact-audit.js';
import { primaryContactConflictError } from '../shared/client-contact-errors.js';
import type { ClientContactView } from '../shared/client-contact-view.js';
import type { UpdateClientContactRepos } from './ports.js';

type UpdateClientContactUow = UpdateClientContactRepos & {
  audit: AuditWriter;
  clientDetail: GetClientQuery;
};

export class UpdateClientContact {
  constructor(private readonly uow: UnitOfWork<UpdateClientContactUow>) {}

  async execute(
    actor: UserActor,
    clientId: string,
    contactId: string,
    input: ClientContactUpdateInput,
  ): Promise<ClientContactView> {
    requireRole(actor, 'admin', 'operator');
    return this.uow.run(actor, async ({ clientContactUpdate, clientDetail, audit }) => {
      const client = await clientDetail.findById(clientId);
      if (!client) throw new ApplicationError('not_found', 'Cliente no encontrado');
      const current = await clientContactUpdate.loadForUpdate(clientId, contactId);
      if (!current) throw new ApplicationError('not_found', 'Contacto no encontrado');

      const email = input.email !== undefined ? input.email : current.email;
      const phone = input.phone !== undefined ? input.phone : current.phone;
      if (!isContactReachable({ email, phone })) {
        throw new ApplicationError('validation_error', 'Se requiere email o teléfono');
      }

      const archiving = input.archived === true && current.archivedAt === null;
      const reactivating = input.archived === false && current.archivedAt !== null;
      let isPrimary = input.isPrimary !== undefined ? input.isPrimary : current.isPrimary;

      if (archiving) {
        if (current.isPrimary) {
          const others = await clientContactUpdate.countOtherActive(clientId, contactId);
          if (archivePrimaryBlocked(true, others)) {
            throw primaryContactConflictError(
              'Designe otro contacto principal antes de archivar el actual',
            );
          }
        }
      } else if (reactivating) {
        const otherPrimaries = await clientContactUpdate.countOtherPrimary(clientId, contactId);
        isPrimary = resolveReactivationPrimary(input.isPrimary, otherPrimaries);
      } else if (input.isPrimary === false && current.isPrimary) {
        const otherPrimaries = await clientContactUpdate.countOtherPrimary(clientId, contactId);
        if (otherPrimaries === 0) {
          throw primaryContactConflictError('Debe existir un contacto principal');
        }
      }

      if (isPrimary && !current.isPrimary) {
        await clientContactUpdate.clearPrimary(clientId);
      }
      const archivedAt = archiving ? new Date() : reactivating ? null : undefined;

      const saved = await clientContactUpdate.save(contactId, {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.roleTitle !== undefined ? { roleTitle: input.roleTitle } : {}),
        ...(isPrimary !== current.isPrimary ? { isPrimary } : {}),
        ...(archivedAt !== undefined ? { archivedAt } : {}),
      });

      const action = archiving
        ? 'client_contact.archived'
        : reactivating
          ? 'client_contact.reactivated'
          : 'client_contact.updated';
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action,
        resourceType: 'client_contact',
        resourceId: contactId,
        changes: {
          before: clientContactAuditSnapshot(current),
          after: clientContactAuditSnapshot(saved),
        },
        requestId: actor.requestId,
      });
      return saved;
    });
  }
}
