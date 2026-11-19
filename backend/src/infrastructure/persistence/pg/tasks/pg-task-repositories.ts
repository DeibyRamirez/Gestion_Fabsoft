import type { TaskPriority, TaskStatus, TaskType } from '@fabsoft/shared';
import type {
  CreateTaskRepository,
  NewTaskRecord,
} from '../../../../application/tasks/create-task/ports.js';
import type { GetTaskQuery } from '../../../../application/tasks/get-task/ports.js';
import type {
  ListTasksQuery,
  ResolvedTaskListQuery,
} from '../../../../application/tasks/list-tasks/ports.js';
import type { CloseTaskRepository } from '../../../../application/tasks/close-task/ports.js';
import type { TaskAutomation } from '../../../../application/tasks/shared/task-automation.js';
import type { TaskView } from '../../../../application/tasks/shared/task-view.js';
import type {
  TaskPatch,
  UpdateTaskRepository,
} from '../../../../application/tasks/update-task/ports.js';
import type { LocalDate } from '../../../../domain/subscriptions/local-date.js';
import { taskOrigin } from '../../../../domain/tasks/task.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface TaskRow {
  id: string;
  task_type: TaskType;
  title: string;
  client_id: string;
  subscription_id: string | null;
  renewal_request_id: string | null;
  alert_rule_id: string | null;
  assignee_user_id: string | null;
  assignee_full_name: string | null;
  priority: TaskPriority;
  due_date: string;
  status: TaskStatus;
  notes: string | null;
  next_action: string | null;
  outcome: string | null;
  completed_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const TASK_SELECT = `
  select t.id, t.task_type, t.title, t.client_id, t.subscription_id, t.renewal_request_id,
         t.alert_rule_id, t.assignee_user_id, u.full_name as assignee_full_name,
         t.priority, t.due_date::text as due_date, t.status, t.notes, t.next_action, t.outcome,
         t.completed_at, t.version, t.created_at, t.updated_at
    from app.tasks t
    left join app.users u on u.id = t.assignee_user_id`;

const SORT: Record<ResolvedTaskListQuery['sort'], string> = {
  dueDate: 't.due_date asc, t.id',
  '-dueDate': 't.due_date desc, t.id',
  priority:
    `case t.priority when 'urgent' then 0 when 'high' then 1 ` +
    `when 'medium' then 2 else 3 end asc, t.due_date asc, t.id`,
  '-priority':
    `case t.priority when 'urgent' then 0 when 'high' then 1 ` +
    `when 'medium' then 2 else 3 end desc, t.due_date asc, t.id`,
  createdAt: 't.created_at asc, t.id',
  '-createdAt': 't.created_at desc, t.id',
};

const toView = (r: TaskRow): TaskView => ({
  id: r.id,
  taskType: r.task_type,
  title: r.title,
  clientId: r.client_id,
  subscriptionId: r.subscription_id,
  renewalRequestId: r.renewal_request_id,
  alertRuleId: r.alert_rule_id,
  assignee:
    r.assignee_user_id && r.assignee_full_name
      ? { id: r.assignee_user_id, fullName: r.assignee_full_name }
      : null,
  priority: r.priority,
  dueDate: r.due_date,
  status: r.status,
  notes: r.notes,
  nextAction: r.next_action,
  outcome: r.outcome,
  completedAt: r.completed_at,
  origin: taskOrigin(r.alert_rule_id, r.renewal_request_id),
  version: r.version,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function loadTask(tx: Tx, id: string): Promise<TaskView | null> {
  const { rows } = await tx.query<TaskRow>(`${TASK_SELECT} where t.id = $1`, [id]);
  return rows[0] ? toView(rows[0]) : null;
}

export class PgListTasksQuery implements ListTasksQuery {
  constructor(private readonly tx: Tx) {}
  async list(q: ResolvedTaskListQuery): Promise<{ items: TaskView[]; total: number }> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (q.assigneeUserId) {
      values.push(q.assigneeUserId);
      where.push(`t.assignee_user_id = $${values.length}`);
    }
    if (q.status?.length) {
      values.push(q.status);
      where.push(`t.status = any($${values.length}::app.task_status[])`);
    }
    if (q.priority?.length) {
      values.push(q.priority);
      where.push(`t.priority = any($${values.length}::app.task_priority[])`);
    }
    if (q.taskType) {
      values.push(q.taskType);
      where.push(`t.task_type = $${values.length}::app.task_type`);
    }
    if (q.clientId) {
      values.push(q.clientId);
      where.push(`t.client_id = $${values.length}`);
    }
    if (q.subscriptionId) {
      values.push(q.subscriptionId);
      where.push(`t.subscription_id = $${values.length}`);
    }
    if (q.dueFrom) {
      values.push(q.dueFrom);
      where.push(`t.due_date >= $${values.length}::date`);
    }
    if (q.dueTo) {
      values.push(q.dueTo);
      where.push(`t.due_date <= $${values.length}::date`);
    }
    if (q.overdue) {
      values.push(q.today);
      where.push(`t.status in ('pending','in_progress') and t.due_date < $${values.length}::date`);
    }
    const filter = where.length ? `where ${where.join(' and ')}` : '';
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::text as n from app.tasks t ${filter}`,
      values,
    );
    const { rows } = await this.tx.query<TaskRow>(
      `${TASK_SELECT} ${filter} order by ${SORT[q.sort]} limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { items: rows.map(toView), total: Number(count.rows[0]?.n ?? 0) };
  }
}

export class PgGetTaskQuery implements GetTaskQuery {
  constructor(private readonly tx: Tx) {}
  findById(id: string): Promise<TaskView | null> {
    return loadTask(this.tx, id);
  }
}

export class PgCreateTaskRepository implements CreateTaskRepository {
  constructor(private readonly tx: Tx) {}
  async insert(r: NewTaskRecord): Promise<TaskView> {
    const { rows } = await this.tx.query<{ id: string }>(
      `insert into app.tasks
         (task_type, title, client_id, subscription_id, assignee_user_id, priority, due_date,
          status, notes, next_action, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $10)
       returning id`,
      [
        r.taskType,
        r.title,
        r.clientId,
        r.subscriptionId,
        r.assigneeUserId,
        r.priority,
        r.dueDate,
        r.notes,
        r.nextAction,
        r.createdBy,
      ],
    );
    const task = await loadTask(this.tx, rows[0]!.id);
    if (!task) throw new Error('tarea no encontrada tras crear');
    return task;
  }
}

export class PgUpdateTaskRepository implements UpdateTaskRepository {
  constructor(private readonly tx: Tx) {}
  loadForUpdate(id: string): Promise<TaskView | null> {
    return loadTask(this.tx, id);
  }
  async save(
    id: string,
    expectedVersion: number,
    p: TaskPatch,
    updatedBy: string,
  ): Promise<TaskView | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (p.title !== undefined) set('title', p.title);
    if (p.assigneeUserId !== undefined) set('assignee_user_id', p.assigneeUserId);
    if (p.priority !== undefined) set('priority', p.priority);
    if (p.dueDate !== undefined) set('due_date', p.dueDate);
    if (p.status !== undefined) set('status', p.status);
    if (p.notes !== undefined) set('notes', p.notes);
    if (p.nextAction !== undefined) set('next_action', p.nextAction);
    if (sets.length === 0) return loadTask(this.tx, id);

    values.push(updatedBy);
    const updatedByParam = values.length;
    values.push(id);
    const idParam = values.length;
    values.push(expectedVersion);
    const versionParam = values.length;
    const { rowCount } = await this.tx.query(
      `update app.tasks
          set ${sets.join(', ')}, version = version + 1, updated_by = $${updatedByParam}
        where id = $${idParam} and version = $${versionParam}
          and status in ('pending','in_progress')`,
      values,
    );
    return rowCount === 1 ? loadTask(this.tx, id) : null;
  }
}

export class PgCloseTaskRepository implements CloseTaskRepository {
  constructor(private readonly tx: Tx) {}
  loadForUpdate(id: string): Promise<TaskView | null> {
    return loadTask(this.tx, id);
  }
  async close(
    id: string,
    expectedVersion: number,
    status: 'completed' | 'cancelled',
    outcome: string,
    closedAt: Date,
    updatedBy: string,
  ): Promise<TaskView | null> {
    const { rowCount } = await this.tx.query(
      `update app.tasks
          set status = $3::app.task_status, outcome = $4, completed_at = $5,
              version = version + 1, updated_by = $6
        where id = $1 and version = $2 and status in ('pending','in_progress')`,
      [id, expectedVersion, status, outcome, closedAt, updatedBy],
    );
    return rowCount === 1 ? loadTask(this.tx, id) : null;
  }
}

export class PgTaskAutomationRepository implements TaskAutomation {
  constructor(private readonly tx: Tx) {}
  async completeAutoTasksForSubscription(
    subscriptionId: string,
    outcome: string,
    updatedBy: string,
  ): Promise<number> {
    const { rowCount } = await this.tx.query(
      `update app.tasks
          set status = 'completed', outcome = $2, completed_at = now(),
              version = version + 1, updated_by = $3
        where subscription_id = $1 and alert_rule_id is not null
          and status in ('pending','in_progress')`,
      [subscriptionId, outcome, updatedBy],
    );
    return rowCount ?? 0;
  }

  async cancelPendingAutoTasksForPeriod(
    subscriptionId: string,
    periodEnd: LocalDate,
    outcome: string,
    updatedBy: string,
  ): Promise<number> {
    const { rowCount } = await this.tx.query(
      `update app.tasks
          set status = 'cancelled', outcome = $3, completed_at = now(),
              version = version + 1, updated_by = $4
        where subscription_id = $1 and status = 'pending'
          and alert_rule_id is not null
          and split_part(dedupe_key, ':', 4) = $2`,
      [subscriptionId, periodEnd, outcome, updatedBy],
    );
    return rowCount ?? 0;
  }

  async annotateInProgressAutoTasksForPeriod(
    subscriptionId: string,
    periodEnd: LocalDate,
    note: string,
    updatedBy: string,
  ): Promise<number> {
    const { rowCount } = await this.tx.query(
      `update app.tasks
          set notes = concat_ws(E'\\n', notes, $3::text),
              version = version + 1, updated_by = $4
        where subscription_id = $1 and status = 'in_progress'
          and alert_rule_id is not null
          and split_part(dedupe_key, ':', 4) = $2`,
      [subscriptionId, periodEnd, note, updatedBy],
    );
    return rowCount ?? 0;
  }

  async cancelOpenAutoTasksForSubscription(
    subscriptionId: string,
    outcome: string,
    updatedBy: string,
  ): Promise<number> {
    const { rowCount } = await this.tx.query(
      `update app.tasks
          set status = 'cancelled', outcome = $2, completed_at = now(),
              version = version + 1, updated_by = $3
        where subscription_id = $1 and alert_rule_id is not null
          and status in ('pending','in_progress')`,
      [subscriptionId, outcome, updatedBy],
    );
    return rowCount ?? 0;
  }

  async cancelOpenTasksForSubscription(
    subscriptionId: string,
    outcome: string,
    updatedBy: string,
  ): Promise<number> {
    const { rowCount } = await this.tx.query(
      `update app.tasks
          set status = 'cancelled', outcome = $2, completed_at = now(),
              version = version + 1, updated_by = $3
        where subscription_id = $1 and status in ('pending','in_progress')`,
      [subscriptionId, outcome, updatedBy],
    );
    return rowCount ?? 0;
  }
}
