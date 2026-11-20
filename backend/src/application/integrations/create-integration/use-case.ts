import type { IntegrationManifest } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { IntegrationView } from '../shared/integration-views.js';
import { assertManifestClients } from '../shared/manifest.js';
import type { IntegrationClientQuery, IntegrationCreateRepository } from '../shared/ports.js';

type Repos = {
  integrationCreate: IntegrationCreateRepository;
  integrationClients: IntegrationClientQuery;
  audit: AuditWriter;
};

export class CreateIntegration {
  constructor(private readonly uow: UnitOfWork<Repos>) {}

  async execute(actor: UserActor, manifest: IntegrationManifest): Promise<IntegrationView> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ integrationCreate, integrationClients, audit }) => {
      await assertManifestClients(integrationClients, manifest);
      let integration: IntegrationView;
      try {
        integration = await integrationCreate.insert({
          manifest,
          createdBy: actor.userId,
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ApplicationError(
            'duplicate_integration',
            'Ya existe una integración con ese slug',
          );
        }
        throw error;
      }
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'integration.created',
        resourceType: 'integration',
        resourceId: integration.id,
        changes: { after: integrationSnapshot(integration) },
        requestId: actor.requestId,
      });
      return integration;
    });
  }
}

export const integrationSnapshot = (integration: IntegrationView) => ({
  slug: integration.slug,
  name: integration.name,
  description: integration.description,
  status: integration.status,
  scopes: integration.scopes,
  clientScope: integration.clientScope,
  clientIds: integration.clientIds,
  manifestVersion: integration.manifestVersion,
  rateLimitPerMinute: integration.rateLimitPerMinute,
});
