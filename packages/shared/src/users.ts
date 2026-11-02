import { z } from 'zod';
import { UserRoleSchema, UserStatusSchema } from './enums.js';
import { PageQuerySchema, PaginationMetaSchema } from './pagination.js';

/** Gestión de usuarios (docs/api/openapi.yaml: User, UserCreate, UserUpdate, UserCreated, UserPage). */
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: UserRoleSchema,
  clientId: z.string().uuid().nullable(),
  status: UserStatusSchema,
  mustChangePassword: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UserDto = z.infer<typeof UserSchema>;

const fullName = z.string().trim().min(2).max(150);

export const UserCreateSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    fullName,
    role: UserRoleSchema,
    clientId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((v) => (v.role === 'client') === (v.clientId != null), {
    path: ['clientId'],
    message: 'clientId es obligatorio si role=client y prohibido en otro caso',
  });
export type UserCreateInput = z.infer<typeof UserCreateSchema>;

export const UserUpdateSchema = z
  .object({
    fullName: fullName.optional(),
    role: UserRoleSchema.optional(),
    clientId: z.string().uuid().nullable().optional(),
    status: UserStatusSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Se requiere al menos un campo' });
export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;

export const UserCreatedSchema = UserSchema.extend({ temporaryPassword: z.string().min(16) });
export type UserCreatedDto = z.infer<typeof UserCreatedSchema>;

export const TemporaryPasswordSchema = z.object({ temporaryPassword: z.string().min(16) });
export type TemporaryPasswordDto = z.infer<typeof TemporaryPasswordSchema>;

export const UserPageSchema = z.object({ data: z.array(UserSchema), meta: PaginationMetaSchema });
export type UserPage = z.infer<typeof UserPageSchema>;

const csvRoles = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean),
  )
  .pipe(z.array(UserRoleSchema));

export const UserListQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  role: csvRoles.optional(),
  status: UserStatusSchema.optional(),
  clientId: z.string().uuid().optional(),
  sort: z.enum(['fullName', '-fullName', 'createdAt', '-createdAt']).default('fullName'),
});
export type UserListQuery = z.infer<typeof UserListQuerySchema>;
