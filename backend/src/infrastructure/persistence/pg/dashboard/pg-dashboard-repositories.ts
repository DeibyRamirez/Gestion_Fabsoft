import type { DashboardCounts } from '../../../../application/dashboard/get-dashboard-summary/ports.js';
import type { GetDashboardSummaryQuery } from '../../../../application/dashboard/get-dashboard-summary/ports.js';
import { addDays, type LocalDate } from '../../../../domain/subscriptions/local-date.js';
import type { Tx } from '../../../db/with-rls-context.js';

interface DashboardRow {
  active_subscriptions: number;
  expiring_30: number;
  expiring_15: number;
  expiring_7: number;
  expired_subscriptions: number;
  renewals_pending_response: number;
  overdue_tasks: number;
  upcoming_tasks: number;
  new_renewal_requests: number;
}

export class PgGetDashboardSummaryQuery implements GetDashboardSummaryQuery {
  constructor(private readonly tx: Tx) {}

  async counts(today: LocalDate, ownerUserId: string | null): Promise<DashboardCounts> {
    const { rows } = await this.tx.query<DashboardRow>(
      `select
         (select count(*)::int from app.subscriptions s
           where s.status in ('active','in_renewal')
             and ($2::uuid is null or s.owner_user_id = $2)) as active_subscriptions,
         (select count(*)::int from app.subscriptions s
           where s.status in ('active','in_renewal')
             and s.current_period_end between $1::date and $3::date
             and ($2::uuid is null or s.owner_user_id = $2)) as expiring_30,
         (select count(*)::int from app.subscriptions s
           where s.status in ('active','in_renewal')
             and s.current_period_end between $1::date and $4::date
             and ($2::uuid is null or s.owner_user_id = $2)) as expiring_15,
         (select count(*)::int from app.subscriptions s
           where s.status in ('active','in_renewal')
             and s.current_period_end between $1::date and $5::date
             and ($2::uuid is null or s.owner_user_id = $2)) as expiring_7,
         (select count(*)::int from app.subscriptions s
           where s.status = 'expired'
             and ($2::uuid is null or s.owner_user_id = $2)) as expired_subscriptions,
         (select count(*)::int from app.subscriptions s
           where s.follow_up_status = 'awaiting_client'
             and ($2::uuid is null or s.owner_user_id = $2)) as renewals_pending_response,
         (select count(*)::int from app.tasks t
           where t.status in ('pending','in_progress')
             and t.due_date < $1::date
             and ($2::uuid is null or t.assignee_user_id = $2)) as overdue_tasks,
         (select count(*)::int from app.tasks t
           where t.status in ('pending','in_progress')
             and t.due_date >= $1::date
             and ($2::uuid is null or t.assignee_user_id = $2)) as upcoming_tasks,
         (select count(*)::int from app.renewal_requests r
           where r.status = 'pending_review'
             and ($2::uuid is null or r.assigned_user_id = $2)) as new_renewal_requests`,
      [today, ownerUserId, addDays(today, 30), addDays(today, 15), addDays(today, 7)],
    );

    const row = rows[0]!;
    return {
      activeSubscriptions: row.active_subscriptions,
      expiringIn30Days: row.expiring_30,
      expiringIn15Days: row.expiring_15,
      expiringIn7Days: row.expiring_7,
      expiredSubscriptions: row.expired_subscriptions,
      renewalsPendingResponse: row.renewals_pending_response,
      overdueTasks: row.overdue_tasks,
      upcomingTasks: row.upcoming_tasks,
      newRenewalRequests: row.new_renewal_requests,
    };
  }
}
