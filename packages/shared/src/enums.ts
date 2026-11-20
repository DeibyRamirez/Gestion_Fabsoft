import { z } from 'zod';

/** Enums del contrato (docs/api/openapi.yaml, docs/data-model.md). */
export const ActorTypeSchema = z.enum(['user', 'integration', 'system']);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const UserRoleSchema = z.enum(['admin', 'operator', 'client']);
export type UserRole = z.infer<typeof UserRoleSchema>;
export const USER_ROLES = UserRoleSchema.options;

export const UserStatusSchema = z.enum(['activo', 'deshabilitado']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const ProductTypeSchema = z.enum(['third_party', 'own', 'recurring_service']);
export type ProductType = z.infer<typeof ProductTypeSchema>;

export const ProductStatusSchema = z.enum(['activo', 'inactivo']);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export const ClientStatusSchema = z.enum(['activo', 'inactivo', 'archivado']);
export type ClientStatus = z.infer<typeof ClientStatusSchema>;

export const SubscriptionStatusSchema = z.enum([
  'pendiente_activacion',
  'activa',
  'en_renovacion',
  'vencida',
  'cancelada',
  'no_renovada',
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

export const PaymentStatusSchema = z.enum(['sin_seguimiento', 'pendiente', 'recibido']);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const FollowUpStatusSchema = z.enum([
  'sin_gestion',
  'en_gestion',
  'esperando_cliente',
  'cerrado',
]);
export type FollowUpStatus = z.infer<typeof FollowUpStatusSchema>;

export const RenewalOutcomeSchema = z.enum(['pendiente', 'renovada', 'no_renovada']);
export type RenewalOutcome = z.infer<typeof RenewalOutcomeSchema>;

export const RenewalRequestStatusSchema = z.enum(['pendiente_revision', 'en_progreso', 'resuelta']);
export type RenewalRequestStatus = z.infer<typeof RenewalRequestStatusSchema>;

export const RenewalRequestResolutionSchema = z.enum(['renovada', 'no_renovada', 'otra']);
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

export const TaskStatusSchema = z.enum(['pendiente', 'en_progreso', 'completada', 'cancelada']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const NotificationTypeSchema = z.enum(['expiration_alert', 'renewal_request_created']);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationChannelSchema = z.enum(['in_app', 'email']);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const NotificationStatusSchema = z.enum(['pendiente', 'enviada', 'fallida', 'cancelada']);
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;

export const IntegrationStatusSchema = z.enum(['activa', 'deshabilitada']);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const ClientScopeSchema = z.enum(['all', 'own']);
export type ClientScope = z.infer<typeof ClientScopeSchema>;

export const ScopeSchema = z.enum([
  'clients:read',
  'products:read',
  'subscriptions:read',
  'renewal-tasks:read',
  'renewal-requests:read',
  'renewal-requests:write',
]);
export type Scope = z.infer<typeof ScopeSchema>;
