import type { NotificationChannel, TaskPriority, TaskType } from '@fabsoft/shared';
import type { AlertRuleView } from '../../../../application/alerts/shared/alert-rule-view.js';
import type { ListAlertRulesQuery } from '../../../../application/alerts/list-alert-rules/ports.js';
import type {
  AlertRulePatch,
  UpdateAlertRuleOutcome,
  UpdateAlertRuleRepository,
} from '../../../../application/alerts/update-alert-rule/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';
import { pgCode, PG } from '../shared/pg-errors.js';

interface AlertRuleRow {
  id: string;
  code: string;
  description: string;
  offset_days: number;
  channels: NotificationChannel[];
  creates_task: boolean;
  task_type: TaskType | null;
  task_priority: TaskPriority | null;
  applies_when_not_renewable: boolean;
  is_active: boolean;
}

const ALERT_RULE_COLUMNS = `id::text as id, code, description, offset_days,
  channels::text[] as channels, creates_task, task_type, task_priority,
  applies_when_not_renewable, is_active`;

const toView = (row: AlertRuleRow): AlertRuleView => ({
  id: row.id,
  code: row.code,
  description: row.description,
  offsetDays: row.offset_days,
  channels: row.channels,
  createsTask: row.creates_task,
  taskType: row.task_type,
  taskPriority: row.task_priority,
  appliesWhenNotRenewable: row.applies_when_not_renewable,
  isActive: row.is_active,
});

export class PgListAlertRulesQuery implements ListAlertRulesQuery {
  constructor(private readonly tx: Tx) {}

  async list(): Promise<AlertRuleView[]> {
    const { rows } = await this.tx.query<AlertRuleRow>(
      `select ${ALERT_RULE_COLUMNS}
         from app.alert_rules
        order by offset_days desc, code`,
    );
    return rows.map(toView);
  }
}

export class PgUpdateAlertRuleRepository implements UpdateAlertRuleRepository {
  constructor(private readonly tx: Tx) {}

  async loadForUpdate(id: string): Promise<AlertRuleView | null> {
    const { rows } = await this.tx.query<AlertRuleRow>(
      `select ${ALERT_RULE_COLUMNS} from app.alert_rules where id = $1 for update`,
      [id],
    );
    return rows[0] ? toView(rows[0]) : null;
  }

  async save(
    id: string,
    patch: AlertRulePatch,
    updatedBy: string,
  ): Promise<UpdateAlertRuleOutcome> {
    try {
      const { rows } = await this.tx.query<AlertRuleRow>(
        `update app.alert_rules set
           description = coalesce($2, description),
           offset_days = coalesce($3, offset_days),
           channels = coalesce($4::app.notification_channel[], channels),
           creates_task = coalesce($5, creates_task),
           task_type = case when $6::boolean then $7::app.task_type else task_type end,
           task_priority = case when $8::boolean then $9::app.task_priority else task_priority end,
           applies_when_not_renewable = coalesce($10, applies_when_not_renewable),
           is_active = coalesce($11, is_active),
           updated_by = $12
         where id = $1
         returning ${ALERT_RULE_COLUMNS}`,
        [
          id,
          patch.description ?? null,
          patch.offsetDays ?? null,
          patch.channels ?? null,
          patch.createsTask ?? null,
          patch.taskType !== undefined,
          patch.taskType ?? null,
          patch.taskPriority !== undefined,
          patch.taskPriority ?? null,
          patch.appliesWhenNotRenewable ?? null,
          patch.isActive ?? null,
          updatedBy,
        ],
      );
      return { ok: true, rule: toView(rows[0] as AlertRuleRow) };
    } catch (err) {
      if (pgCode(err) === PG.uniqueViolation) return { ok: false, reason: 'offset_taken' };
      if (pgCode(err) === PG.checkViolation) {
        return { ok: false, reason: 'invalid_task_configuration' };
      }
      throw err;
    }
  }
}
