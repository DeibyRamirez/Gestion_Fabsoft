import type { ClientArchiveInput } from '@fabsoft/shared';
import { canArchiveClient } from '../../../domain/clients/client.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import { clientAuditSnapshot } from '../shared/client-audit.js';
import type { ClientView } from '../shared/client-view.js';
import type { ArchiveClientRepos } from './ports.js';

type ArchiveClientUow = ArchiveClientRepos & { audit: AuditWriter };

export class ArchiveClient {
  constructor(private readonly uow: UnitOfWork<ArchiveClientUow>) {}

  async execute(actor: UserActor, id: string, _input: ClientArchiveInput): Promise<ClientView> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ clientArchive, audit }) => {
      const current = await clientArchive.loadForUpdate(id);
      if (!current) throw new ApplicationError('not_found', 'Cliente no encontrado');
      if (!canArchiveClient(current.status)) {
        throw new ApplicationError('invalid_state_transition', 'El cliente ya está archivado');
      }
      const archivedAt = new Date();
      const client = await clientArchive.archive(id, archivedAt, actor.userId);
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'client.archived',
        resourceType: 'client',
        resourceId: id,
        changes: { before: clientAuditSnapshot(current), after: clientAuditSnapshot(client) },
        requestId: actor.requestId,
      });
      return client;
    });
  }
}
