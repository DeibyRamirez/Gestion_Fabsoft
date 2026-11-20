import type { IntegrationUpdateInput } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { IntegrationView } from '../shared/integration-views.js';
import type { IntegrationGetRepository, IntegrationUpdateRepository } from '../shared/ports.js';
import { integrationSnapshot } from '../create-integration/use-case.js';

type Repos = {
  integrationDetail: IntegrationGetRepository;
  integrationUpdate: IntegrationUpdateRepository;
  audit: AuditWriter;
};

export class UpdateIntegration {
  constructor(private readonly uow: UnitOfWork<Repos>) {}

  async execute(
    actor: UserActor,
    id: string,
    input: IntegrationUpdateInput,
  ): Promise<IntegrationView> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ integrationDetail, integrationUpdate, audit }) => {
      const before = await integrationDetail.findById(id);
      if (!before) throw new ApplicationError('not_found', 'Integración no encontrada');
      const updated = await integrationUpdate.update({
        id,
        patch: input,
        updatedBy: actor.userId,
      });
      if (!updated) throw new ApplicationError('not_found', 'Integración no encontrada');
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'integration.updated',
        resourceType: 'integration',
        resourceId: id,
        changes: {
          before: integrationSnapshot(before),
          after: integrationSnapshot(updated),
        },
        requestId: actor.requestId,
      });
      return updated;
    });
  }
}
