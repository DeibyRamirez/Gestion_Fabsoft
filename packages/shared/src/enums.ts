import { z } from 'zod';

/** Enums del contrato (docs/api/openapi.yaml, docs/data-model.md). */
export const UserRoleSchema = z.enum(['admin', 'operator', 'client']);
export type UserRole = z.infer<typeof UserRoleSchema>;
export const USER_ROLES = UserRoleSchema.options;

export const UserStatusSchema = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const ProductTypeSchema = z.enum(['third_party', 'own', 'recurring_service']);
export type ProductType = z.infer<typeof ProductTypeSchema>;

export const ProductStatusSchema = z.enum(['active', 'inactive']);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export const SubscriptionStatusSchema = z.enum([
  'pending_activation',
  'active',
  'in_renewal',
  'expired',
  'cancelled',
  'not_renewed',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;
