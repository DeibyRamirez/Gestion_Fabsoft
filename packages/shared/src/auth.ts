import { z } from 'zod';
import { UserRoleSchema } from './enums.js';

/** Auth humana (ADR-001, docs/api/openapi.yaml: LoginInput, TokenResponse, Me, ChangePasswordInput). */
export const PASSWORD_MIN_LENGTH = 12;
export const REFRESH_COOKIE_NAME = 'fs_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'fabsoft-web';

export const LoginInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(256),
  })
  .strict();
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const MeSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: UserRoleSchema,
  clientId: z.string().uuid().nullable(),
  mustChangePassword: z.boolean(),
});
export type Me = z.infer<typeof MeSchema>;

export const TokenResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int(),
  user: MeSchema,
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const ChangePasswordInputSchema = z
  .object({
    currentPassword: z.string().max(256),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(256),
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

/** Ruta de inicio según rol (redirección tras login; docs/frontend-structure.md). */
export function homePathForRole(role: z.infer<typeof UserRoleSchema>): string {
  return role === 'client' ? '/portal' : '/dashboard';
}
