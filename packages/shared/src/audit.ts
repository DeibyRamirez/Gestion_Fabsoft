import { z } from 'zod';
import { ActorTypeSchema } from './enums.js';
import { PageQuerySchema, PaginationMetaSchema } from './pagination.js';

export const AuditActorSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type AuditActor = z.infer<typeof AuditActorSchema>;

export const AuditLogSchema = z.object({
  id: z.string(),
  occurredAt: z.string().datetime(),
  actorType: ActorTypeSchema,
  actor: AuditActorSchema.nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  clientId: z.string().uuid().nullable(),
  changes: z.record(z.string(), z.unknown()).nullable(),
  reason: z.string().nullable(),
  requestId: z.string().nullable(),
});
export type AuditLogDto = z.infer<typeof AuditLogSchema>;

export const AuditLogPageSchema = z.object({
  data: z.array(AuditLogSchema),
  meta: PaginationMetaSchema,
});
export type AuditLogPage = z.infer<typeof AuditLogPageSchema>;

export const AuditLogListQuerySchema = PageQuerySchema.extend({
  actorType: ActorTypeSchema.optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(120).optional(),
  resourceType: z.string().trim().min(1).max(80).optional(),
  resourceId: z.string().trim().min(1).max(200).optional(),
  clientId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type AuditLogListQuery = z.infer<typeof AuditLogListQuerySchema>;

export const ClientActivitySchema = z.object({
  id: z.string(),
  occurredAt: z.string().datetime(),
  actor: AuditActorSchema.nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  summary: z.string(),
});
export type ClientActivityDto = z.infer<typeof ClientActivitySchema>;

export const ClientActivityPageSchema = z.object({
  data: z.array(ClientActivitySchema),
  meta: PaginationMetaSchema,
});
export type ClientActivityPage = z.infer<typeof ClientActivityPageSchema>;

export const ClientActivityQuerySchema = PageQuerySchema;
export type ClientActivityQuery = z.infer<typeof ClientActivityQuerySchema>;
