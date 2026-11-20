import type { NotificationChannel, NotificationStatus, NotificationType } from '@fabsoft/shared';
import type {
  ClaimedNotifications,
  DispatchableNotification,
  NotificationDispatchRepository,
} from '../../../../application/notifications/dispatch-notifications/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface DueRow {
  id: string;
  notification_type: NotificationType;
  subscription_id: string | null;
  period_end: string | null;
  channel: NotificationChannel;
  recipient_email: string;
  recipient_name: string;
  client_name: string | null;
  product_name: string | null;
  rule_code: string | null;
  dedupe_key: string;
  attempts: number;
  max_attempts: number;
}

export class PgNotificationDispatchRepository implements NotificationDispatchRepository {
  constructor(private readonly tx: Tx) {}

  async claimDue(now: Date, lockUntil: Date, batchSize: number): Promise<ClaimedNotifications> {
    const cancelled = await this.tx.query(
      `update app.notifications n
          set status = 'cancelada', cancelled_at = $1, cancel_reason = 'not_eligible'
        where n.status = 'pendiente' and n.scheduled_for <= $1
          and (
            (
              n.notification_type = 'expiration_alert'
              and (
                exists (
                  select 1 from app.subscriptions s
                   where s.id = n.subscription_id
                     and s.status in ('cancelada','no_renovada','pendiente_activacion')
                )
                or exists (
                  select 1 from app.subscriptions s
                   where s.id = n.subscription_id
                     and n.period_end is distinct from s.current_period_end
                )
                or not exists (
                  select 1 from app.alert_rules r
                   where r.id = n.alert_rule_id and r.is_active
                )
                or exists (
                  select 1
                    from app.subscriptions s
                    left join lateral (
                      select sp.renewal_outcome
                        from app.subscription_periods sp
                       where sp.subscription_id = s.id
                       order by sp.period_number desc
                       limit 1
                    ) per on true
                    join app.alert_rules r on r.id = n.alert_rule_id
                   where s.id = n.subscription_id
                     and (not s.is_renewable or per.renewal_outcome = 'no_renovada')
                     and not coalesce(r.applies_when_not_renewable, false)
                )
              )
            )
            or (
              n.notification_type = 'renewal_request_created'
              and exists (
                select 1 from app.renewal_requests rr
                 where rr.id = n.renewal_request_id and rr.status = 'resuelta'
              )
            )
          )`,
      [now],
    );

    const { rows } = await this.tx.query<DueRow>(
      `select n.id, n.notification_type, n.subscription_id, n.period_end::text as period_end,
              n.channel, u.email as recipient_email, u.full_name as recipient_name,
              c.legal_name as client_name, p.name as product_name,
              r.code as rule_code, n.dedupe_key, n.attempts, n.max_attempts
         from app.notifications n
         join app.users u on u.id = n.recipient_user_id
         left join app.subscriptions s on s.id = n.subscription_id
         left join app.clients c on c.id = s.client_id
         left join app.products p on p.id = s.product_id
         left join app.alert_rules r on r.id = n.alert_rule_id
        where n.status = 'pendiente' and n.scheduled_for <= $1
          and (n.next_attempt_at is null or n.next_attempt_at <= $1)
          and (n.locked_until is null or n.locked_until < $1)
        order by n.scheduled_for, n.id
        for update of n skip locked
        limit $2`,
      [now, batchSize],
    );

    if (rows.length > 0) {
      await this.tx.query(
        `update app.notifications set locked_until = $2 where id = any($1::uuid[])`,
        [rows.map((r) => r.id), lockUntil],
      );
    }

    const items: DispatchableNotification[] = rows.map((r) => ({
      id: r.id,
      notificationType: r.notification_type,
      subscriptionId: r.subscription_id,
      periodEnd: r.period_end,
      channel: r.channel,
      recipientEmail: r.recipient_email,
      recipientName: r.recipient_name,
      clientName: r.client_name,
      productName: r.product_name,
      ruleCode: r.rule_code,
      dedupeKey: r.dedupe_key,
      attempts: r.attempts,
      maxAttempts: r.max_attempts,
    }));
    return { items, cancelled: cancelled.rowCount ?? 0 };
  }

  async markSent(
    id: string,
    attempts: number,
    providerMessageId: string | null,
    sentAt: Date,
  ): Promise<boolean> {
    const { rowCount } = await this.tx.query(
      `update app.notifications
          set status = 'enviada', attempts = $2, sent_at = $4, next_attempt_at = null,
              locked_until = null, last_error = null, provider_message_id = $3
        where id = $1 and status = 'pendiente'`,
      [id, attempts, providerMessageId, sentAt],
    );
    return (rowCount ?? 0) > 0;
  }

  async markFailure(
    id: string,
    attempts: number,
    status: Extract<NotificationStatus, 'pendiente' | 'fallida'>,
    lastError: string,
    nextAttemptAt: Date | null,
  ): Promise<boolean> {
    const { rowCount } = await this.tx.query(
      `update app.notifications
          set status = $3::app.notification_status, attempts = $2, last_error = $4,
              next_attempt_at = $5, locked_until = null
        where id = $1 and status = 'pendiente'`,
      [id, attempts, status, lastError, nextAttemptAt],
    );
    return (rowCount ?? 0) > 0;
  }
}
