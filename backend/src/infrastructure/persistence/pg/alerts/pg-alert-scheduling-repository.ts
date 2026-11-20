import type {
  NotificationChannel,
  RenewalOutcome,
  SubscriptionStatus,
  TaskPriority,
  TaskType,
} from '@fabsoft/shared';
import type {
  AlertReconcileResult,
  AlertScheduling,
} from '../../../../application/alerts/shared/alert-scheduling.js';
import {
  alertDedupeKey,
  alertScheduledFor,
  alertTargetDate,
  hasAlertEligibleStatus,
  isRenewableForAlerts,
  resolveAlertRecipients,
  ruleAppliesToSubscription,
  shouldScheduleOnOrAfter,
} from '../../../../domain/alerts/alert-policy.js';
import type { LocalDate } from '../../../../domain/subscriptions/local-date.js';
import { addDays, compareLocalDate } from '../../../../domain/subscriptions/local-date.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface SubscriptionAlertRow {
  id: string;
  client_id: string;
  status: SubscriptionStatus;
  is_renewable: boolean;
  current_period_end: string;
  renewal_outcome: RenewalOutcome | null;
  subscription_owner_id: string | null;
  client_owner_id: string | null;
  client_legal_name: string;
}

interface RuleRow {
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

const SUBSCRIPTION_ALERT_CONTEXT = `
  select s.id, s.client_id, s.status, s.is_renewable,
         s.current_period_end::text as current_period_end,
         per.renewal_outcome, c.legal_name as client_legal_name,
         (select u.id from app.users u
           where u.id = s.owner_user_id and u.status = 'activo'
             and u.role in ('admin','operator')) as subscription_owner_id,
         (select u.id from app.users u
           where u.id = c.owner_user_id and u.status = 'activo'
             and u.role in ('admin','operator')) as client_owner_id
    from app.subscriptions s
    join app.clients c on c.id = s.client_id
    left join lateral (
      select sp.renewal_outcome
        from app.subscription_periods sp
       where sp.subscription_id = s.id
       order by sp.period_number desc
       limit 1
    ) per on true
   where s.id = $1`;

const ACTIVE_RULES = `
  select id, code, description, offset_days, channels::text[] as channels,
         creates_task, task_type, task_priority,
         applies_when_not_renewable, is_active
    from app.alert_rules
   where is_active
   order by offset_days desc, code`;

const ACTIVE_ADMINS = `
  select id from app.users
   where role = 'admin' and status = 'activo'
   order by created_at, id`;

export class PgAlertSchedulingRepository implements AlertScheduling {
  constructor(private readonly tx: Tx) {}

  private async loadSubscription(subscriptionId: string): Promise<SubscriptionAlertRow | null> {
    const { rows } = await this.tx.query<SubscriptionAlertRow>(SUBSCRIPTION_ALERT_CONTEXT, [
      subscriptionId,
    ]);
    return rows[0] ?? null;
  }

  private async loadRecipients(row: SubscriptionAlertRow): Promise<string[]> {
    if (row.subscription_owner_id || row.client_owner_id) {
      return resolveAlertRecipients({
        subscriptionOwnerId: row.subscription_owner_id,
        clientOwnerId: row.client_owner_id,
        activeAdminIds: [],
      });
    }
    const { rows } = await this.tx.query<{ id: string }>(ACTIVE_ADMINS);
    return resolveAlertRecipients({
      subscriptionOwnerId: null,
      clientOwnerId: null,
      activeAdminIds: rows.map((r) => r.id),
    });
  }

  async scheduleForPeriod(subscriptionId: string, today: LocalDate): Promise<number> {
    const subscription = await this.loadSubscription(subscriptionId);
    if (!subscription || !hasAlertEligibleStatus(subscription.status)) return 0;

    const state = {
      status: subscription.status,
      isRenewable: subscription.is_renewable,
      renewalOutcome: subscription.renewal_outcome ?? 'pendiente',
    };
    const recipients = await this.loadRecipients(subscription);
    if (recipients.length === 0) return 0;

    const { rows: rules } = await this.tx.query<RuleRow>(ACTIVE_RULES);
    const ruleIds: string[] = [];
    const channels: NotificationChannel[] = [];
    const recipientIds: string[] = [];
    const scheduledFor: Date[] = [];
    const dedupeKeys: string[] = [];
    const taskRuleIds: string[] = [];
    const taskTypes: TaskType[] = [];
    const taskPriorities: TaskPriority[] = [];
    const taskDueDates: LocalDate[] = [];
    const taskTitles: string[] = [];
    const taskNotes: string[] = [];
    const taskDedupeKeys: string[] = [];

    for (const rule of rules) {
      if (
        !ruleAppliesToSubscription(
          {
            code: rule.code,
            offsetDays: rule.offset_days,
            channels: rule.channels,
            appliesWhenNotRenewable: rule.applies_when_not_renewable,
            isActive: rule.is_active,
          },
          state,
        )
      ) {
        continue;
      }
      const target = alertTargetDate(subscription.current_period_end, rule.offset_days);
      if (!shouldScheduleOnOrAfter(target, today)) continue;
      const scheduled = alertScheduledFor(subscription.current_period_end, rule.offset_days);

      for (const channel of new Set(rule.channels)) {
        for (const recipientUserId of recipients) {
          ruleIds.push(rule.id);
          channels.push(channel);
          recipientIds.push(recipientUserId);
          scheduledFor.push(scheduled);
          dedupeKeys.push(
            alertDedupeKey(
              subscriptionId,
              rule.code,
              subscription.current_period_end,
              channel,
              recipientUserId,
            ),
          );
        }
      }

      if (rule.creates_task && rule.task_type && rule.task_priority) {
        const twoDaysAfter = addDays(target, 2);
        const dueDate =
          rule.offset_days > 0 &&
          compareLocalDate(twoDaysAfter, subscription.current_period_end) > 0
            ? subscription.current_period_end
            : twoDaysAfter;
        taskRuleIds.push(rule.id);
        taskTypes.push(rule.task_type);
        taskPriorities.push(rule.task_priority);
        taskDueDates.push(dueDate);
        taskTitles.push(`${rule.description} · ${subscription.client_legal_name}`.slice(0, 200));
        taskNotes.push(`Generada automáticamente por la regla ${rule.code}.`);
        taskDedupeKeys.push(
          `alert:${subscriptionId}:${rule.code}:${subscription.current_period_end}`,
        );
      }
    }

    if (ruleIds.length === 0) return 0;
    const { rowCount } = await this.tx.query(
      `insert into app.notifications
         (notification_type, subscription_id, alert_rule_id, period_end, channel,
          recipient_user_id, scheduled_for, status, dedupe_key)
       select 'expiration_alert', $1, x.rule_id, $2::date, x.channel, x.recipient_user_id,
              x.scheduled_for, 'pendiente', x.dedupe_key
         from unnest($3::uuid[], $4::app.notification_channel[], $5::uuid[],
                     $6::timestamptz[], $7::text[])
              as x(rule_id, channel, recipient_user_id, scheduled_for, dedupe_key)
       on conflict (dedupe_key) do nothing`,
      [
        subscriptionId,
        subscription.current_period_end,
        ruleIds,
        channels,
        recipientIds,
        scheduledFor,
        dedupeKeys,
      ],
    );

    if (taskRuleIds.length > 0) {
      await this.tx.query(
        `insert into app.tasks
           (task_type, client_id, subscription_id, alert_rule_id, assignee_user_id, priority,
            due_date, status, title, notes, dedupe_key)
         select x.task_type, $1, $2, x.rule_id, $3, x.priority,
                x.due_date, 'pendiente', x.title, x.notes, x.dedupe_key
           from unnest($4::app.task_type[], $5::uuid[], $6::app.task_priority[],
                       $7::date[], $8::text[], $9::text[], $10::text[])
                as x(task_type, rule_id, priority, due_date, title, notes, dedupe_key)
         on conflict do nothing`,
        [
          subscription.client_id,
          subscriptionId,
          recipients[0],
          taskTypes,
          taskRuleIds,
          taskPriorities,
          taskDueDates,
          taskTitles,
          taskNotes,
          taskDedupeKeys,
        ],
      );
    }
    return rowCount ?? 0;
  }

  async cancelPendingForPeriod(
    subscriptionId: string,
    periodEnd: LocalDate,
    reason: 'renewed' | 'period_end_changed',
  ): Promise<number> {
    const { rowCount } = await this.tx.query(
      `update app.notifications
          set status = 'cancelada', cancelled_at = now(), cancel_reason = $3
        where subscription_id = $1 and status = 'pendiente'
          and notification_type = 'expiration_alert'
          and period_end = $2::date`,
      [subscriptionId, periodEnd, reason],
    );
    return rowCount ?? 0;
  }

  async cancelPendingWithoutException(
    subscriptionId: string,
    reason: 'not_renewed' | 'not_renewable',
  ): Promise<number> {
    const { rowCount } = await this.tx.query(
      `update app.notifications n
          set status = 'cancelada', cancelled_at = now(), cancel_reason = $2
         from app.alert_rules r
        where n.subscription_id = $1 and n.status = 'pendiente'
          and n.notification_type = 'expiration_alert'
          and n.alert_rule_id = r.id
          and not r.applies_when_not_renewable`,
      [subscriptionId, reason],
    );
    return rowCount ?? 0;
  }

  async cancelAllPending(
    subscriptionId: string,
    reason: 'subscription_cancelled',
  ): Promise<number> {
    const { rowCount } = await this.tx.query(
      `update app.notifications
          set status = 'cancelada', cancelled_at = now(), cancel_reason = $2
        where subscription_id = $1 and status = 'pendiente'`,
      [subscriptionId, reason],
    );
    return rowCount ?? 0;
  }

  /**
   * HU-13: si cambia el umbral de una regla, la clave de idempotencia
   * (subscription/rule/period/channel/recipient) no cambia. En vez de cancelar
   * y no poder recrear la alerta, se reprograma la pendiente a la nueva fecha.
   * Si la nueva fecha ya pasó, el UPDATE no la toca y el cancel de abajo la cierra.
   */
  private async rescheduleRuleChanges(
    subscriptionId: string,
    periodEnd: LocalDate,
    eligible: boolean,
    notRenewable: boolean,
    today: LocalDate,
  ): Promise<number> {
    if (!eligible) return 0;
    const { rowCount } = await this.tx.query(
      `update app.notifications n
          set scheduled_for = (
                ((n.period_end - r.offset_days)::timestamp + time '08:00')
                  at time zone 'America/Bogota'
              )
         from app.alert_rules r
        where n.subscription_id = $1
          and n.status = 'pendiente'
          and n.notification_type = 'expiration_alert'
          and n.alert_rule_id = r.id
          and n.period_end = $2::date
          and r.is_active
          and (not $3::boolean or r.applies_when_not_renewable)
          and (n.period_end - r.offset_days) >= $4::date
          and n.scheduled_for <> (
                ((n.period_end - r.offset_days)::timestamp + time '08:00')
                  at time zone 'America/Bogota'
              )`,
      [subscriptionId, periodEnd, notRenewable, today],
    );
    return rowCount ?? 0;
  }

  private async cancelStaleForReconcile(
    subscriptionId: string,
    periodEnd: LocalDate,
    eligible: boolean,
    notRenewable: boolean,
  ): Promise<number> {
    const { rowCount } = await this.tx.query(
      `update app.notifications n
          set status = 'cancelada',
              cancelled_at = now(),
              cancel_reason = case
                when n.period_end is distinct from $2::date then 'period_end_changed'
                when not r.is_active then 'rule_changed'
                when n.scheduled_for <> (
                  ((n.period_end - r.offset_days)::timestamp + time '08:00')
                    at time zone 'America/Bogota'
                ) then 'rule_changed'
                when not (n.channel = any(r.channels)) then 'rule_changed'
                when not $3 then 'not_eligible'
                when $4 and not r.applies_when_not_renewable then 'not_renewable'
                else 'not_eligible'
              end
         from app.alert_rules r
        where n.subscription_id = $1 and n.status = 'pendiente'
          and n.notification_type = 'expiration_alert'
          and n.alert_rule_id = r.id
          and (
            n.period_end is distinct from $2::date
            or not r.is_active
            or n.scheduled_for <> (
              ((n.period_end - r.offset_days)::timestamp + time '08:00')
                at time zone 'America/Bogota'
            )
            or not (n.channel = any(r.channels))
            or not $3
            or ($4 and not r.applies_when_not_renewable)
          )`,
      [subscriptionId, periodEnd, eligible, notRenewable],
    );
    return rowCount ?? 0;
  }

  async reconcile(today: LocalDate): Promise<AlertReconcileResult> {
    const { rows } = await this.tx.query<{ id: string }>(
      `select s.id
         from app.subscriptions s
        where s.status in ('activa','en_renovacion','vencida')
           or exists (
             select 1 from app.notifications n
              where n.subscription_id = s.id and n.status = 'pendiente'
           )
        order by s.id`,
    );

    let scheduled = 0;
    let cancelled = 0;
    for (const { id } of rows) {
      const subscription = await this.loadSubscription(id);
      if (!subscription) continue;
      const eligible = hasAlertEligibleStatus(subscription.status);
      const notRenewable = !isRenewableForAlerts({
        status: subscription.status,
        isRenewable: subscription.is_renewable,
        renewalOutcome: subscription.renewal_outcome ?? 'pendiente',
      });
      await this.rescheduleRuleChanges(
        id,
        subscription.current_period_end,
        eligible,
        notRenewable,
        today,
      );
      cancelled += await this.cancelStaleForReconcile(
        id,
        subscription.current_period_end,
        eligible,
        notRenewable,
      );
      if (eligible) scheduled += await this.scheduleForPeriod(id, today);
    }
    return { scannedSubscriptions: rows.length, scheduled, cancelled };
  }
}
