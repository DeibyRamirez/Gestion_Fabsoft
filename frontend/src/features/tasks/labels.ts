import type { TaskOrigin, TaskPriority, TaskStatus, TaskType } from '@fabsoft/shared';

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
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const TASK_ORIGIN_LABELS: Record<TaskOrigin, string> = {
  manual: 'Manual',
  alert_rule: 'Regla de alerta',
  renewal_request: 'Solicitud',
};
