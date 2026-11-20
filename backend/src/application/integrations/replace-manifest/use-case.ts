import type { IntegrationManifest } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import type { IntegrationView } from '../shared/integration-views.js';
import {
  assertManifestClients,
  assertManifestSlug,
  assertManifestVersion,
} from '../shared/manifest.js';
import type {
  IntegrationClientQuery,
  IntegrationGetRepository,
  IntegrationManifestRepository,
} from '../shared/ports.js';

type Repos = {
  integrationDetail: IntegrationGetRepository;
  integrationClients: IntegrationClientQuery;
  integrationManifest: IntegrationManifestRepository;
  audit: AuditWriter;
};

export class ReplaceIntegrationManifest {
  constructor(private readonly uow: UnitOfWork<Repos>) {}

  async execute(
    actor: UserActor,
    id: string,
    manifest: IntegrationManifest,
  ): Promise<IntegrationView> {
    requireRole(actor, 'admin');
    return this.uow.run(
      actor,
      async ({ integrationDetail, integrationClients, integrationManifest, audit }) => {
        const before = await integrationDetail.findById(id);
        if (!before) throw new ApplicationError('not_found', 'Integración no encontrada');
        assertManifestSlug(before.slug, manifest);
        assertManifestVersion(before.manifestVersion, manifest.version);
        await assertManifestClients(integrationClients, manifest);
        const updated = await integrationManifest.replaceManifest({
          id,
          manifest,
          updatedBy: actor.userId,
        });
        if (!updated) throw new ApplicationError('not_found', 'Integración no encontrada');
        await audit.write({
          actor: { type: 'user', userId: actor.userId },
          action: 'integration.manifest_updated',
          resourceType: 'integration',
          resourceId: id,
          changes: {
            before: {
              manifest: before.manifest,
              manifestVersion: before.manifestVersion,
              scopes: before.scopes,
              clientScope: before.clientScope,
              clientIds: before.clientIds,
              rateLimitPerMinute: before.rateLimitPerMinute,
            },
            after: {
              manifest: updated.manifest,
              manifestVersion: updated.manifestVersion,
              scopes: updated.scopes,
              clientScope: updated.clientScope,
              clientIds: updated.clientIds,
              rateLimitPerMinute: updated.rateLimitPerMinute,
            },
          },
          requestId: actor.requestId,
        });
        return updated;
      },
    );
  }
}
