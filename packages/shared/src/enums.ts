import { z } from 'zod';

/** Enums del contrato (docs/api/openapi.yaml, docs/data-model.md). */
export const ActorTypeSchema = z.enum(['user', 'integration', 'system']);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const UserRoleSchema = z.enum(['admin', 'operator', 'client']);
export type UserRole = z.infer<typeof UserRoleSchema>;
export const USER_ROLES = UserRoleSchema.options;

export const UserStatusSchema = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const ProductTypeSchema = z.enum(['third_party', 'own', 'recurring_service']);
export type ProductType = z.infer<typeof ProductTypeSchema>;

export const ProductStatusSchema = z.enum(['active', 'inactive']);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export const ClientStatusSchema = z.enum(['active', 'inactive', 'archived']);
export type ClientStatus = z.infer<typeof ClientStatusSchema>;

export const SubscriptionStatusSchema = z.enum([
  'pending_activation',
  'active',
  'in_renewal',
  'expired',
  'cancelled',
  'not_renewed',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const BillingCycleSchema = z.enum([
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'biennial',
  'custom',
]);
export type BillingCycle = z.infer<typeof BillingCycleSchema>;

export const PaymentStatusSchema = z.enum(['not_tracked', 'pending', 'received']);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const FollowUpStatusSchema = z.enum(['none', 'in_progress', 'awaiting_client', 'closed']);
export type FollowUpStatus = z.infer<typeof FollowUpStatusSchema>;

export const RenewalOutcomeSchema = z.enum(['pending', 'renewed', 'not_renewed']);
export type RenewalOutcome = z.infer<typeof RenewalOutcomeSchema>;

export const RenewalRequestStatusSchema = z.enum(['pending_review', 'in_progress', 'resolved']);
export type RenewalRequestStatus = z.infer<typeof RenewalRequestStatusSchema>;

export const RenewalRequestResolutionSchema = z.enum(['renewed', 'not_renewed', 'other']);
export type RenewalRequestResolution = z.infer<typeof RenewalRequestResolutionSchema>;

export const TaskTypeSchema = z.enum([
  'contact_client',
  'send_proposal',
  'confirm_terms',
  'verify_payment',
  'confirm_renewal',
  'record_non_renewal',
  'review_renewal_request',
  'review_expired',
  'other',
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const NotificationTypeSchema = z.enum(['expiration_alert', 'renewal_request_created']);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationChannelSchema = z.enum(['in_app', 'email']);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const NotificationStatusSchema = z.enum(['pending', 'sent', 'failed', 'cancelled']);
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;
