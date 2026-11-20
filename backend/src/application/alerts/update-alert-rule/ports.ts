import type { NotificationChannel, TaskPriority, TaskType } from '@fabsoft/shared';
import type { AlertRuleView } from '../shared/alert-rule-view.js';

export interface AlertRulePatch {
  description?: string;
  offsetDays?: number;
  channels?: NotificationChannel[];
  createsTask?: boolean;
  taskType?: TaskType | null;
  taskPriority?: TaskPriority | null;
  appliesWhenNotRenewable?: boolean;
  isActive?: boolean;
}

export type UpdateAlertRuleOutcome =
  | { ok: true; rule: AlertRuleView }
  | { ok: false; reason: 'offset_taken' | 'invalid_task_configuration' };

export interface UpdateAlertRuleRepository {
  loadForUpdate(id: string): Promise<AlertRuleView | null>;
  save(id: string, patch: AlertRulePatch, updatedBy: string): Promise<UpdateAlertRuleOutcome>;
}

export interface UpdateAlertRuleRepos {
  alertRuleUpdate: UpdateAlertRuleRepository;
}
