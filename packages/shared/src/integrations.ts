import { z } from 'zod';
import { ClientScopeSchema, IntegrationStatusSchema, ScopeSchema } from './enums.js';
import { PageQuerySchema, PaginationMetaSchema } from './pagination.js';

const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'Usa una versión semver (1.2.3)');
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, 'Slug inválido');

const manifestBase = z
  .object({
    $schema: z.string().optional(),
    manifest_schema_version: z.literal(1),
    integration: slug,
    version: semver,
    display_name: z.string().trim().min(2).max(120),
    description: z.string().max(2000).optional(),
    owner: z
      .object({
        team: z.string().max(120).optional(),
        contact_email: z.string().email().optional(),
      })
      .strict()
      .optional(),
    scopes: z
      .array(ScopeSchema)
      .min(1)
      .refine((values) => new Set(values).size === values.length, {
        message: 'Los scopes no deben repetirse',
      }),
    client_scope: ClientScopeSchema,
    client_ids: z.array(z.string().uuid()).min(1).optional(),
    rate_limit_per_minute: z.number().int().min(1).max(6000).default(60),
    credential_ttl_days: z.number().int().min(1).max(730).nullable().optional(),
  })
  .strict();

export const IntegrationManifestSchema = manifestBase.superRefine((manifest, ctx) => {
  if (manifest.client_scope === 'own' && !manifest.client_ids?.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['client_ids'],
      message: 'client_ids es obligatorio y no vacío cuando client_scope=own',
    });
  }
  if (manifest.client_scope === 'all' && manifest.client_ids !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['client_ids'],
      message: 'client_ids no se permite cuando client_scope=all',
    });
  }
});
export type IntegrationManifest = z.infer<typeof IntegrationManifestSchema>;

export const IntegrationCreateSchema = z.object({ manifest: IntegrationManifestSchema }).strict();
export type IntegrationCreateInput = z.infer<typeof IntegrationCreateSchema>;

export const IntegrationUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: IntegrationStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Se requiere al menos un campo',
  });
export type IntegrationUpdateInput = z.infer<typeof IntegrationUpdateSchema>;

export const IntegrationSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: IntegrationStatusSchema,
  scopes: z.array(ScopeSchema),
  clientScope: ClientScopeSchema,
  clientIds: z.array(z.string().uuid()),
  manifestVersion: z.string(),
  manifest: IntegrationManifestSchema,
  rateLimitPerMinute: z.number().int(),
  activeCredentials: z.number().int().min(0),
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type IntegrationDto = z.infer<typeof IntegrationSchema>;

export const IntegrationPageSchema = z.object({
  data: z.array(IntegrationSchema),
  meta: PaginationMetaSchema,
});
export type IntegrationPage = z.infer<typeof IntegrationPageSchema>;

export const IntegrationListQuerySchema = PageQuerySchema.extend({
  status: IntegrationStatusSchema.optional(),
});
export type IntegrationListQuery = z.infer<typeof IntegrationListQuerySchema>;

export const ApiCredentialSchema = z.object({
  id: z.string().uuid(),
  integrationId: z.string().uuid(),
  keyPrefix: z.string(),
  label: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ApiCredentialDto = z.infer<typeof ApiCredentialSchema>;

export const ApiCredentialCreateSchema = z
  .object({
    label: z.string().trim().max(100).nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .strict();
export type ApiCredentialCreateInput = z.infer<typeof ApiCredentialCreateSchema>;

export const ApiCredentialCreatedSchema = ApiCredentialSchema.extend({
  apiKey: z.string(),
});
export type ApiCredentialCreatedDto = z.infer<typeof ApiCredentialCreatedSchema>;
