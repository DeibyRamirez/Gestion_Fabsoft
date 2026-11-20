/**
 * Labels en español de todos los enums y acciones del contrato (@fabsoft/shared).
 * Solo presentación. Los valores enviados al API NO cambian: siempre se envía la clave.
 */
import type {
  ActorType,
  BillingCycle,
  ClientStatus,
  FollowUpStatus,
  IntegrationStatus,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  PaymentStatus,
  ProductStatus,
  ProductType,
  RenewalOutcome,
  RenewalRequestResolution,
  RenewalRequestStatus,
  Scope,
  SubscriptionStatus,
  TaskOrigin,
  TaskPriority,
  TaskStatus,
  TaskType,
  UserRole,
  UserStatus,
} from '@fabsoft/shared';

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  pendiente_activacion: 'Pendiente de activación',
  activa: 'Activa',
  en_renovacion: 'En renovación',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
  no_renovada: 'No renovada',
};

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
  biennial: 'Bienal',
  custom: 'Personalizado',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  sin_seguimiento: 'Sin seguimiento',
  pendiente: 'Pendiente',
  recibido: 'Recibido',
};

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  sin_gestion: 'Sin gestión',
  en_gestion: 'En gestión',
  esperando_cliente: 'Esperando al cliente',
  cerrado: 'Cerrado',
};

export const RENEWAL_OUTCOME_LABELS: Record<RenewalOutcome, string> = {
  pendiente: 'Pendiente',
  renovada: 'Renovada',
  no_renovada: 'No renovada',
};

export const RENEWAL_REQUEST_STATUS_LABELS: Record<RenewalRequestStatus, string> = {
  pendiente_revision: 'Pendiente de revisión',
  en_progreso: 'En progreso',
  resuelta: 'Resuelta',
};

export const RENEWAL_REQUEST_RESOLUTION_LABELS: Record<RenewalRequestResolution, string> = {
  renovada: 'Renovada',
  no_renovada: 'No renovada',
  otra: 'Otra',
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  archivado: 'Archivado',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  operator: 'Operador',
  client: 'Cliente',
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  activo: 'Activo',
  deshabilitado: 'Deshabilitado',
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  third_party: 'De terceros',
  own: 'Propio',
  recurring_service: 'Servicio recurrente',
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
};

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  activa: 'Activa',
  deshabilitada: 'Deshabilitada',
};

export const SCOPE_LABELS: Record<Scope, string> = {
  'clients:read': 'Leer clientes',
  'products:read': 'Leer productos',
  'subscriptions:read': 'Leer suscripciones',
  'renewal-tasks:read': 'Leer tareas',
  'renewal-requests:read': 'Leer solicitudes',
  'renewal-requests:write': 'Crear solicitudes',
};

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  pendiente: 'Pendiente',
  enviada: 'Enviada',
  fallida: 'Fallida',
  cancelada: 'Cancelada',
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'En la app',
  email: 'Email',
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  expiration_alert: 'Alerta de vencimiento',
  renewal_request_created: 'Solicitud de renovación',
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  contact_client: 'Contactar cliente',
  send_proposal: 'Enviar propuesta',
  confirm_terms: 'Confirmar condiciones',
  verify_payment: 'Verificar pago',
  confirm_renewal: 'Confirmar renovación',
  record_non_renewal: 'Registrar no renovación',
  review_renewal_request: 'Revisar solicitud',
  review_expired: 'Revisar vencida',
  other: 'Otra',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

export const TASK_ORIGIN_LABELS: Record<TaskOrigin, string> = {
  manual: 'Manual',
  alert_rule: 'Regla de alerta',
  renewal_request: 'Solicitud',
};

export const AUDIT_ACTOR_TYPE_LABELS: Record<ActorType, string> = {
  user: 'Usuario',
  integration: 'Integración',
  system: 'Sistema',
};

/** Acciones de auditoría → texto legible. Si no está, se muestra el código original. */
export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  'alert_rule.updated': 'Regla de alerta actualizada',
  'api_credential.created': 'API key emitida',
  'api_credential.revoked': 'API key revocada',
  'auth.login_failed': 'Inicio de sesión fallido',
  'auth.refresh_reuse_detected': 'Reutilización de sesión detectada',
  'client.archived': 'Cliente archivado',
  'client.created': 'Cliente creado',
  'client.reactivated': 'Cliente reactivado',
  'client.updated': 'Cliente actualizado',
  'client_contact.archived': 'Contacto archivado',
  'client_contact.created': 'Contacto agregado',
  'client_contact.updated': 'Contacto actualizado',
  'integration.created': 'Integración creada',
  'integration.manifest_updated': 'Manifest actualizado',
  'integration.updated': 'Integración actualizada',
  'notification.retried': 'Alerta reintentada',
  'product.created': 'Producto creado',
  'product.deactivated': 'Producto desactivado',
  'product.updated': 'Producto actualizado',
  'renewal_request.created': 'Solicitud de renovación creada',
  'renewal_request.updated': 'Solicitud actualizada',
  'subscription.activated': 'Suscripción activada',
  'subscription.cancelled': 'Suscripción cancelada',
  'subscription.created': 'Suscripción creada',
  'subscription.expiration_corrected': 'Vencimiento corregido',
  'subscription.not_renewed': 'Suscripción no renovada',
  'subscription.price_changed': 'Precio actualizado',
  'subscription.renewal_started': 'Renovación iniciada',
  'subscription.renewed': 'Suscripción renovada',
  'subscription.updated': 'Suscripción actualizada',
  'subscription_period.payment_updated': 'Pago de periodo actualizado',
  'task.cancelled': 'Tarea cancelada',
  'task.completed': 'Tarea completada',
  'task.created': 'Tarea creada',
  'task.updated': 'Tarea actualizada',
  'user.created': 'Usuario creado',
  'user.password_reset': 'Contraseña restablecida',
  'user.updated': 'Usuario actualizado',
};

export function activityLabel(action: string): string {
  return ACTIVITY_ACTION_LABELS[action] ?? action;
}
