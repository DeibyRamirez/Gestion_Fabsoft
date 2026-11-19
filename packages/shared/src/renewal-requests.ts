import { z } from 'zod';
import { RenewalRequestResolutionSchema, RenewalRequestStatusSchema } from './enums.js';
import { PageQuerySchema, PaginationMetaSchema } from './pagination.js';
import { UserRefSchema } from './users.js';

export const RenewalRequestCreateSchema = z
  .object({
    subscriptionId: z.string().uuid(),
    comment: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type RenewalRequestCreateInput = z.infer<typeof RenewalRequestCreateSchema>;

export const RenewalRequestUpdateSchema = z
  .object({
    status: z.literal('in_progress').optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Se requiere al menos un campo' });
export type RenewalRequestUpdateInput = z.infer<typeof RenewalRequestUpdateSchema>;

export const RenewalRequestResolveSchema = z
  .object({
    resolution: RenewalRequestResolutionSchema,
    resolutionNote: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type RenewalRequestResolveInput = z.infer<typeof RenewalRequestResolveSchema>;

export const RenewalRequestRequestedBySchema = z.object({
  actorType: z.enum(['user', 'integration']),
  id: z.string().uuid(),
  name: z.string().optional(),
});
export type RenewalRequestRequestedBy = z.infer<typeof RenewalRequestRequestedBySchema>;

export const RenewalRequestSchema = z.object({
  id: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  clientId: z.string().uuid(),
  requestedBy: RenewalRequestRequestedBySchema,
  comment: z.string().nullable(),
  status: RenewalRequestStatusSchema,
  assignedUser: UserRefSchema.nullable(),
  resolution: RenewalRequestResolutionSchema.nullable(),
  resolutionNote: z.string().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RenewalRequestDto = z.infer<typeof RenewalRequestSchema>;

const csvRenewalRequestStatus = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  )
  .pipe(z.array(RenewalRequestStatusSchema));

export const RenewalRequestListQuerySchema = PageQuerySchema.extend({
  status: csvRenewalRequestStatus.optional(),
  clientId: z.string().uuid().optional(),
  subscriptionId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  sort: z.enum(['createdAt', '-createdAt']).default('-createdAt'),
});
export type RenewalRequestListQuery = z.infer<typeof RenewalRequestListQuerySchema>;

export const RenewalRequestPageSchema = z.object({
  data: z.array(RenewalRequestSchema),
  meta: PaginationMetaSchema,
});
export type RenewalRequestPage = z.infer<typeof RenewalRequestPageSchema>;
