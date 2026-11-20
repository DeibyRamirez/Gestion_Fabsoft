import type { NotificationChannel, TaskPriority, TaskType } from '@fabsoft/shared';

export interface AlertRuleView {
  id: string;
  code: string;
  description: string;
  offsetDays: number;
  channels: NotificationChannel[];
  createsTask: boolean;
  taskType: TaskType | null;
  taskPriority: TaskPriority | null;
  appliesWhenNotRenewable: boolean;
  isActive: boolean;
}

export const alertRuleSnapshot = (rule: AlertRuleView) => ({
  description: rule.description,
  offsetDays: rule.offsetDays,
  channels: rule.channels,
  createsTask: rule.createsTask,
  taskType: rule.taskType,
  taskPriority: rule.taskPriority,
  appliesWhenNotRenewable: rule.appliesWhenNotRenewable,
  isActive: rule.isActive,
});
