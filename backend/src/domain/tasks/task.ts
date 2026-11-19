import type { TaskOrigin, TaskStatus } from '@fabsoft/shared';
import { DomainError } from '../shared/domain-error.js';
import { compareLocalDate, type LocalDate } from '../subscriptions/local-date.js';

export const OPEN_TASK_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress'];

export function isTaskOpen(status: TaskStatus): boolean {
  return OPEN_TASK_STATUSES.includes(status);
}

/** completed/cancelled son terminales: no se editan ni se vuelven a cerrar. */
export function assertTaskOpen(status: TaskStatus): void {
  if (!isTaskOpen(status)) {
    throw new DomainError('invalid_state_transition', 'La tarea ya está cerrada');
  }
}

export function isTaskOverdue(dueDate: LocalDate, status: TaskStatus, today: LocalDate): boolean {
  return isTaskOpen(status) && compareLocalDate(dueDate, today) < 0;
}

export function taskOrigin(
  alertRuleId: string | null,
  renewalRequestId: string | null,
): TaskOrigin {
  if (renewalRequestId !== null) return 'renewal_request';
  if (alertRuleId !== null) return 'alert_rule';
  return 'manual';
}
