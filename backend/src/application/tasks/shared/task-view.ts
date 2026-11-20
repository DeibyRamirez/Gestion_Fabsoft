import type { TaskOrigin, TaskPriority, TaskStatus, TaskType, UserRef } from '@fabsoft/shared';
import type { LocalDate } from '../../../domain/subscriptions/local-date.js';

export interface TaskView {
  id: string;
  taskType: TaskType;
  title: string;
  clientId: string;
  subscriptionId: string | null;
  renewalRequestId: string | null;
  alertRuleId: string | null;
  assignee: UserRef | null;
  priority: TaskPriority;
  dueDate: LocalDate;
  status: TaskStatus;
  notes: string | null;
  nextAction: string | null;
  outcome: string | null;
  completedAt: Date | null;
  origin: TaskOrigin;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
