import {
  ApiCredentialCreateSchema,
  IntegrationCreateSchema,
  IntegrationListQuerySchema,
  IntegrationManifestSchema,
  IntegrationUpdateSchema,
  type ApiCredentialCreatedDto,
  type ApiCredentialDto,
  type IntegrationDto,
  type IntegrationPage,
} from '@fabsoft/shared';
import { API_VERSION_PREFIX } from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthenticateApiKey } from '../../../../application/integrations/authenticate-api-key/use-case.js';
import type { CreateIntegration } from '../../../../application/integrations/create-integration/use-case.js';
import type { CreateIntegrationCredential } from '../../../../application/integrations/create-credential/use-case.js';
import type { GetIntegration } from '../../../../application/integrations/get-integration/use-case.js';
import type { ListIntegrationCredentials } from '../../../../application/integrations/list-credentials/use-case.js';
import type { ListIntegrations } from '../../../../application/integrations/list-integrations/use-case.js';
import type { ReplaceIntegrationManifest } from '../../../../application/integrations/replace-manifest/use-case.js';
import type { RevokeIntegrationCredential } from '../../../../application/integrations/revoke-credential/use-case.js';
import type { UpdateIntegration } from '../../../../application/integrations/update-integration/use-case.js';
import type {
  ApiCredentialView,
  IntegrationView,
} from '../../../../application/integrations/shared/integration-views.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface IntegrationsRouteDeps {
  listIntegrations: ListIntegrations;
  getIntegration: GetIntegration;
  createIntegration: CreateIntegration;
  updateIntegration: UpdateIntegration;
  replaceIntegrationManifest: ReplaceIntegrationManifest;
  listIntegrationCredentials: ListIntegrationCredentials;
  createIntegrationCredential: CreateIntegrationCredential;
  revokeIntegrationCredential: RevokeIntegrationCredential;
  authenticateApiKey: AuthenticateApiKey;
}

const IdSchema = z.string().uuid();

export const toIntegrationDto = (integration: IntegrationView): IntegrationDto => ({
  id: integration.id,
  slug: integration.slug,
  name: integration.name,
  description: integration.description,
  status: integration.status,
  scopes: integration.scopes,
  clientScope: integration.clientScope,
  clientIds: integration.clientIds,
  manifestVersion: integration.manifestVersion,
  manifest: integration.manifest,
  rateLimitPerMinute: integration.rateLimitPerMinute,
  activeCredentials: integration.activeCredentials,
  lastUsedAt: integration.lastUsedAt?.toISOString() ?? null,
  createdAt: integration.createdAt.toISOString(),
  updatedAt: integration.updatedAt.toISOString(),
});

export const toApiCredentialDto = (credential: ApiCredentialView): ApiCredentialDto => ({
  id: credential.id,
  integrationId: credential.integrationId,
  keyPrefix: credential.keyPrefix,
  label: credential.label,
  expiresAt: credential.expiresAt?.toISOString() ?? null,
  revokedAt: credential.revokedAt?.toISOString() ?? null,
  lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
  createdAt: credential.createdAt.toISOString(),
});

/** /integrations: sólo admin; las credenciales se muestran una única vez. */
export function integrationsRouter(
  deps: IntegrationsRouteDeps,
  guards: RequestHandler[],
  createIdempotency: RequestHandler,
): Router {
  const router = Router();
  const adminGuards = [...guards, requireRole('admin')];

  router.get('/integrations', ...adminGuards, async (req, res) => {
    const query = IntegrationListQuerySchema.parse(req.query);
    const result = await deps.listIntegrations.execute(actorOf(res), query);
    const body: IntegrationPage = {
      data: result.items.map(toIntegrationDto),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
    res.json(body);
  });

  router.post('/integrations', ...adminGuards, createIdempotency, async (req, res) => {
    const { manifest } = IntegrationCreateSchema.parse(req.body);
    const integration = await deps.createIntegration.execute(actorOf(res), manifest);
    res.setHeader('Location', `${API_VERSION_PREFIX}/integrations/${integration.id}`);
    res.status(201).json(toIntegrationDto(integration));
  });

  router.get('/integrations/:id', ...adminGuards, async (req, res) => {
    const integration = await deps.getIntegration.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json(toIntegrationDto(integration));
  });

  router.patch('/integrations/:id', ...adminGuards, async (req, res) => {
    const integration = await deps.updateIntegration.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      IntegrationUpdateSchema.parse(req.body),
    );
    res.json(toIntegrationDto(integration));
  });

  router.put('/integrations/:id/manifest', ...adminGuards, async (req, res) => {
    const integration = await deps.replaceIntegrationManifest.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      IntegrationManifestSchema.parse(req.body),
    );
    res.json(toIntegrationDto(integration));
  });

  router.get('/integrations/:id/credentials', ...adminGuards, async (req, res) => {
    const credentials = await deps.listIntegrationCredentials.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json({ data: credentials.map(toApiCredentialDto) });
  });

  router.post('/integrations/:id/credentials', ...adminGuards, async (req, res) => {
    const created = await deps.createIntegrationCredential.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      ApiCredentialCreateSchema.parse(req.body),
    );
    res.setHeader('Cache-Control', 'no-store');
    const body: ApiCredentialCreatedDto = {
      ...toApiCredentialDto(created.credential),
      apiKey: created.apiKey,
    };
    res.status(201).json(body);
  });

  router.post(
    '/integrations/:id/credentials/:credentialId/revoke',
    ...adminGuards,
    async (req, res) => {
      const credential = await deps.revokeIntegrationCredential.execute(
        actorOf(res),
        IdSchema.parse(req.params.id),
        IdSchema.parse(req.params.credentialId),
      );
      res.json(toApiCredentialDto(credential));
    },
  );

  return router;
}
