import type {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  UserRef,
} from '@fabsoft/shared';
import type { MarkNotificationReadRepository } from '../../../../application/notifications/mark-notification-read/ports.js';
import type { ListNotificationsQuery } from '../../../../application/notifications/list-notifications/ports.js';
import type { ResolvedNotificationListQuery } from '../../../../application/notifications/list-notifications/ports.js';
import type {
  NotificationForRetry,
  RetryNotificationRepository,
} from '../../../../application/notifications/retry-notification/ports.js';
import type { NotificationView } from '../../../../application/notifications/shared/notification-view.js';
import type { LocalDate } from '../../../../domain/subscriptions/local-date.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface NotificationRow {
  id: string;
  notification_type: NotificationType;
  subscription_id: string | null;
  renewal_request_id: string | null;
  task_id: string | null;
  rule_code: string | null;
  rule_description: string | null;
  period_end: string | null;
  channel: NotificationChannel;
  recipient_id: string;
  recipient_full_name: string;
  scheduled_for: Date;
  status: NotificationStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: Date | null;
  last_error: string | null;
  sent_at: Date | null;
  read_at: Date | null;
  cancel_reason: string | null;
  client_legal_name: string | null;
  obsolete?: boolean;
}

const NOTIFICATION_SELECT = `
  select n.id, n.notification_type, n.subscription_id, n.renewal_request_id, n.task_id,
         r.code as rule_code, r.description as rule_description,
         n.period_end::text as period_end, n.channel,
         u.id as recipient_id, u.full_name as recipient_full_name,
         n.scheduled_for, n.status, n.attempts, n.max_attempts, n.next_attempt_at,
         n.last_error, n.sent_at, n.read_at, n.cancel_reason,
         c.legal_name as client_legal_name
    from app.notifications n
    join app.users u on u.id = n.recipient_user_id
    left join app.alert_rules r on r.id = n.alert_rule_id
    left join app.subscriptions s on s.id = n.subscription_id
    left join app.clients c on c.id = s.client_id`;

const RETRY_SELECT = `
  select n.id, n.notification_type, n.subscription_id, n.renewal_request_id, n.task_id,
         r.code as rule_code, r.description as rule_description,
         n.period_end::text as period_end, n.channel,
         u.id as recipient_id, u.full_name as recipient_full_name,
         n.scheduled_for, n.status, n.attempts, n.max_attempts, n.next_attempt_at,
         n.last_error, n.sent_at, n.read_at, n.cancel_reason,
         c.legal_name as client_legal_name,
         case
           when n.notification_type = 'expiration_alert' then (
             s.id is null
             or s.status in ('cancelada','no_renovada','pendiente_activacion')
             or n.period_end is distinct from s.current_period_end
             or r.id is null
             or not r.is_active
             or (
               (not s.is_renewable or per.renewal_outcome = 'no_renovada')
               and not coalesce(r.applies_when_not_renewable, false)
             )
           )
           when n.notification_type = 'renewal_request_created' then (
             rr.id is null or rr.status = 'resuelta'
           )
           else false
         end as obsolete
    from app.notifications n
    join app.users u on u.id = n.recipient_user_id
    left join app.alert_rules r on r.id = n.alert_rule_id
    left join app.subscriptions s on s.id = n.subscription_id
    left join app.clients c on c.id = s.client_id
    left join app.renewal_requests rr on rr.id = n.renewal_request_id
    left join lateral (
      select sp.renewal_outcome
        from app.subscription_periods sp
       where sp.subscription_id = s.id
       order by sp.period_number desc
       limit 1
    ) per on true`;

const recipient = (r: NotificationRow): UserRef => ({
  id: r.recipient_id,
  fullName: r.recipient_full_name,
});

const title = (r: NotificationRow): string => {
  if (r.notification_type === 'renewal_request_created') {
    return `Nueva solicitud de renovación · ${r.client_legal_name ?? 'Cliente'}`;
  }
  return `${r.rule_description ?? r.rule_code ?? 'Alerta'} · ${
    r.client_legal_name ?? 'Cliente'
  } · vence ${r.period_end ?? ''}`.trim();
};

const toView = (r: NotificationRow): NotificationView => ({
  id: r.id,
  notificationType: r.notification_type,
  subscriptionId: r.subscription_id,
  renewalRequestId: r.renewal_request_id,
  taskId: r.task_id,
  ruleCode: r.rule_code,
  periodEnd: r.period_end as LocalDate | null,
  channel: r.channel,
  recipient: recipient(r),
  scheduledFor: r.scheduled_for,
  status: r.status,
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  nextAttemptAt: r.next_attempt_at,
  lastError: r.last_error,
  sentAt: r.sent_at,
  readAt: r.read_at,
  cancelReason: r.cancel_reason,
  title: title(r),
});

export class PgNotificationsRepository
  implements ListNotificationsQuery, MarkNotificationReadRepository, RetryNotificationRepository
{
  constructor(private readonly tx: Tx) {}

  async list(
    q: ResolvedNotificationListQuery,
  ): Promise<{ items: NotificationView[]; total: number; unreadCount: number }> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (q.mine) {
      values.push(q.actorUserId);
      where.push(`n.recipient_user_id = $${values.length}`);
      where.push(`n.channel = 'in_app'`);
      where.push(`n.status = 'enviada'`);
    }
    if (q.unread) where.push(`n.read_at is null`);
    if (q.status?.length) {
      values.push(q.status);
      where.push(`n.status = any($${values.length}::app.notification_status[])`);
    }
    if (q.channel) {
      values.push(q.channel);
      where.push(`n.channel = $${values.length}::app.notification_channel`);
    }
    if (q.subscriptionId) {
      values.push(q.subscriptionId);
      where.push(`n.subscription_id = $${values.length}`);
    }
    const filter = where.length ? `where ${where.join(' and ')}` : '';
    const sort = q.sort === 'scheduledFor' ? 'asc' : 'desc';
    const count = await this.tx.query<{ n: string }>(
      `select count(*)::text as n from app.notifications n ${filter}`,
      values,
    );
    const { rows } = await this.tx.query<NotificationRow>(
      `${NOTIFICATION_SELECT} ${filter}
        order by n.scheduled_for ${sort}, n.id
        limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, q.pageSize, (q.page - 1) * q.pageSize],
    );
    const unread = await this.tx.query<{ n: string }>(
      `select count(*)::text as n from app.notifications
        where recipient_user_id = $1 and channel = 'in_app'
          and status = 'enviada' and read_at is null`,
      [q.actorUserId],
    );
    return {
      items: rows.map(toView),
      total: Number(count.rows[0]?.n ?? 0),
      unreadCount: Number(unread.rows[0]?.n ?? 0),
    };
  }

  async findById(id: string): Promise<NotificationView | null> {
    const { rows } = await this.tx.query<NotificationRow>(
      `${NOTIFICATION_SELECT} where n.id = $1`,
      [id],
    );
    return rows[0] ? toView(rows[0]) : null;
  }

  async markRead(id: string, userId: string, readAt: Date): Promise<boolean> {
    const { rowCount } = await this.tx.query(
      `update app.notifications
          set read_at = $3
        where id = $1 and recipient_user_id = $2 and channel = 'in_app'
          and status = 'enviada' and read_at is null`,
      [id, userId, readAt],
    );
    return (rowCount ?? 0) > 0;
  }

  async loadForRetry(id: string): Promise<NotificationForRetry | null> {
    const { rows } = await this.tx.query<NotificationRow>(`${RETRY_SELECT} where n.id = $1`, [id]);
    const row = rows[0];
    return row ? { notification: toView(row), obsolete: row.obsolete ?? false } : null;
  }

  async restart(id: string, now: Date): Promise<NotificationView | null> {
    const { rowCount } = await this.tx.query(
      `update app.notifications
          set status = 'pendiente', attempts = 0, next_attempt_at = $2, locked_until = null,
              last_error = null, sent_at = null, cancelled_at = null, cancel_reason = null,
              read_at = null, provider_message_id = null
        where id = $1 and status = 'fallida'`,
      [id, now],
    );
    return rowCount === 1 ? this.findById(id) : null;
  }
}
