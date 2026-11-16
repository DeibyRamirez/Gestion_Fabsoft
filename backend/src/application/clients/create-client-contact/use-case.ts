import type { ClientContactCreateInput } from '@fabsoft/shared';
import {
  isContactReachable,
  resolveCreatePrimary,
} from '../../../domain/clients/client-contact.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { GetClientQuery } from '../get-client/ports.js';
import { clientContactAuditSnapshot } from '../shared/client-contact-audit.js';
import type { ClientContactView } from '../shared/client-contact-view.js';
import type { CreateClientContactRepos } from './ports.js';

type CreateClientContactUow = CreateClientContactRepos & {
  audit: AuditWriter;
  clientDetail: GetClientQuery;
};

export class CreateClientContact {
  constructor(private readonly uow: UnitOfWork<CreateClientContactUow>) {}

  async execute(
    actor: UserActor,
    clientId: string,
    input: ClientContactCreateInput,
  ): Promise<ClientContactView> {
    requireRole(actor, 'admin', 'operator');
    const email = input.email ?? null;
    const phone = input.phone ?? null;
    if (!isContactReachable({ email, phone })) {
      throw new ApplicationError('validation_error', 'Se requiere email o teléfono');
    }
    return this.uow.run(actor, async ({ clientContactCreate, clientDetail, audit }) => {
      const client = await clientDetail.findById(clientId);
      if (!client) throw new ApplicationError('not_found', 'Cliente no encontrado');

      const activeCount = await clientContactCreate.countActive(clientId);
      const isPrimary = resolveCreatePrimary(activeCount, input.isPrimary ?? false);
      if (isPrimary) await clientContactCreate.clearPrimary(clientId);

      const created = await clientContactCreate.insert({
        clientId,
        fullName: input.fullName,
        email,
        phone,
        roleTitle: input.roleTitle ?? null,
        isPrimary,
      });
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'client_contact.created',
        resourceType: 'client_contact',
        resourceId: created.id,
        changes: { after: clientContactAuditSnapshot(created) },
        requestId: actor.requestId,
      });
      return created;
    });
  }
}
