import { z } from 'zod';
import { ClientStatusSchema } from './enums.js';
import { PageQuerySchema, PaginationMetaSchema } from './pagination.js';

const legalName = z.string().trim().min(2).max(200);
const taxIdField = z.union([z.string().trim().min(3).max(30), z.null()]);

export const ClientOwnerRefSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
});
export type ClientOwnerRef = z.infer<typeof ClientOwnerRefSchema>;

export const ClientSchema = z.object({
  id: z.string().uuid(),
  legalName: z.string(),
  taxId: z.string().nullable(),
  status: ClientStatusSchema,
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  owner: z.union([ClientOwnerRefSchema, z.null()]),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ClientDto = z.infer<typeof ClientSchema>;

export const ClientCreateSchema = z
  .object({
    legalName,
    taxId: taxIdField.optional(),
    email: z.union([z.string().trim().email(), z.null()]).optional(),
    phone: z.union([z.string().trim().max(30), z.null()]).optional(),
    ownerUserId: z.union([z.string().uuid(), z.null()]).optional(),
    status: z.enum(['active', 'inactive']).default('active'),
  })
  .strict();
export type ClientCreateInput = z.infer<typeof ClientCreateSchema>;

export const ClientUpdateSchema = z
  .object({
    legalName: legalName.optional(),
    taxId: taxIdField.optional(),
    email: z.union([z.string().trim().email(), z.null()]).optional(),
    phone: z.union([z.string().trim().max(30), z.null()]).optional(),
    ownerUserId: z.union([z.string().uuid(), z.null()]).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Se requiere al menos un campo' });
export type ClientUpdateInput = z.infer<typeof ClientUpdateSchema>;

export const ClientArchiveSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type ClientArchiveInput = z.infer<typeof ClientArchiveSchema>;

export const ClientPageSchema = z.object({
  data: z.array(ClientSchema),
  meta: PaginationMetaSchema,
});
export type ClientPage = z.infer<typeof ClientPageSchema>;

const csvClientStatus = z
  .string()
  .default('active,inactive')
  .transform((s) =>
    s
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  )
  .pipe(z.array(ClientStatusSchema));

export const ClientListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: csvClientStatus,
  taxId: z.string().trim().max(30).optional(),
  ownerUserId: z.string().uuid().optional(),
  sort: z.enum(['legalName', '-legalName', 'createdAt', '-createdAt']).default('legalName'),
});
export type ClientListQuery = z.infer<typeof ClientListQuerySchema>;
