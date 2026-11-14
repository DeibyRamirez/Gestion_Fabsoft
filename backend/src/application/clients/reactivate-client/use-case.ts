import { canReactivateClient } from '../../../domain/clients/client.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import { clientAuditSnapshot } from '../shared/client-audit.js';
import type { ClientView } from '../shared/client-view.js';
import type { ReactivateClientRepos } from './ports.js';

type ReactivateClientUow = ReactivateClientRepos & { audit: AuditWriter };

export class ReactivateClient {
  constructor(private readonly uow: UnitOfWork<ReactivateClientUow>) {}

  async execute(actor: UserActor, id: string): Promise<ClientView> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ clientReactivate, audit }) => {
      const current = await clientReactivate.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Cliente no encontrado');
      if (!canReactivateClient(current.status)) {
        throw new ApplicationError('invalid_state_transition', 'El cliente ya está activo');
      }
      const client = await clientReactivate.reactivate(id, actor.userId);
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'client.reactivated',
        resourceType: 'client',
        resourceId: id,
        changes: { before: clientAuditSnapshot(current), after: clientAuditSnapshot(client) },
        requestId: actor.requestId,
      });
      return client;
    });
  }
}