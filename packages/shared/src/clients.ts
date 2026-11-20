import { z } from 'zod';
import { ClientStatusSchema, UserRoleSchema } from './enums.js';
import { PageQuerySchema, PaginationMetaSchema } from './pagination.js';

const legalName = z.string().trim().min(2).max(200);
const taxIdField = z.union([z.string().trim().min(3).max(30), z.null()]);

export const ClientOwnerRefSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
});
export type ClientOwnerRef = z.infer<typeof ClientOwnerRefSchema>;

export const ClientOwnerCandidateSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  role: UserRoleSchema,
});
export type ClientOwnerCandidate = z.infer<typeof ClientOwnerCandidateSchema>;

export const ClientOwnerCandidateListSchema = z.object({
  data: z.array(ClientOwnerCandidateSchema),
});
export type ClientOwnerCandidateList = z.infer<typeof ClientOwnerCandidateListSchema>;

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
    status: z.enum(['activo', 'inactivo']).default('activo'),
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
    status: z.enum(['activo', 'inactivo']).optional(),
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
  .default('activo,inactivo')
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

const contactEmail = z.string().trim().email();
const contactPhone = z.string().trim().max(30);
const contactRoleTitle = z.string().trim().max(100);
const contactFullName = z.string().trim().min(2).max(150);

export const ClientContactSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  roleTitle: z.string().nullable(),
  isPrimary: z.boolean(),
  archivedAt: z.string().datetime().nullable(),
});
export type ClientContactDto = z.infer<typeof ClientContactSchema>;

const reachable = (v: { email?: string | null | undefined; phone?: string | null | undefined }) =>
  Boolean(v.email) || Boolean(v.phone);

/** Requiere email o teléfono (constraint `client_contacts_reachable`). */
export const ClientContactCreateSchema = z
  .object({
    fullName: contactFullName,
    email: z.union([contactEmail, z.null()]).optional(),
    phone: z.union([contactPhone, z.null()]).optional(),
    roleTitle: z.union([contactRoleTitle, z.null()]).optional(),
    isPrimary: z.boolean().default(false),
  })
  .strict()
  .refine(reachable, { message: 'Se requiere email o teléfono', path: ['email'] });
export type ClientContactCreateInput = z.infer<typeof ClientContactCreateSchema>;

/** `archived` es la baja lógica (RN-14); desmarcar el único principal no se permite (RN-16). */
export const ClientContactUpdateSchema = z
  .object({
    fullName: contactFullName.optional(),
    email: z.union([contactEmail, z.null()]).optional(),
    phone: z.union([contactPhone, z.null()]).optional(),
    roleTitle: z.union([contactRoleTitle, z.null()]).optional(),
    isPrimary: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Se requiere al menos un campo' });
export type ClientContactUpdateInput = z.infer<typeof ClientContactUpdateSchema>;

export const ClientContactListQuerySchema = z.object({
  includeArchived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default(false)
    .transform((v) => v === true || v === 'true'),
});
export type ClientContactListQuery = z.infer<typeof ClientContactListQuerySchema>;
