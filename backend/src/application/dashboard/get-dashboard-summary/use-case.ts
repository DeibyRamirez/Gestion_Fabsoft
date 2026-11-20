import type {
  DashboardIndicator,
  DashboardSummary,
  DashboardSummaryQuery,
} from '@fabsoft/shared';
import { addDays } from '../../../domain/subscriptions/local-date.js';
import { toBogotaLocalDate } from '../../../domain/subscriptions/bogota-date.js';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { Clock, UnitOfWork } from '../../shared/ports.js';
import type { GetDashboardSummaryRepos } from './ports.js';

const indicator = (
  resource: DashboardIndicator['resource'],
  filter: Record<string, string>,
  count: number,
): DashboardIndicator => ({ count, resource, filter });

export class GetDashboardSummary {
  constructor(
    private readonly uow: UnitOfWork<GetDashboardSummaryRepos>,
    private readonly clock: Clock,
  ) {}

  async execute(actor: UserActor, query: DashboardSummaryQuery): Promise<DashboardSummary> {
    requireRole(actor, 'admin', 'operator');
    const ownerUserId = query.ownerUserId === 'me' ? actor.userId : (query.ownerUserId ?? null);
    const today = toBogotaLocalDate(this.clock.now());
    const owner = ownerUserId ? { ownerUserId } : {};
    const assignee = ownerUserId ? { assigneeUserId: ownerUserId } : {};
    const assigned = ownerUserId ? { assignedUserId: ownerUserId } : {};

    return this.uow.run(actor, async ({ dashboardSummary }) => {
      const counts = await dashboardSummary.counts(today, ownerUserId);
      const expiringFilter = (days: number): Record<string, string> => ({
        status: 'active,in_renewal',
        expiresFrom: today,
        expiresTo: addDays(today, days),
        ...owner,
      });

      return {
        today,
        activeSubscriptions: indicator(
          'subscriptions',
          { status: 'active,in_renewal', ...owner },
          counts.activeSubscriptions,
        ),
        expiringIn30Days: indicator(
          'subscriptions',
          expiringFilter(30),
          counts.expiringIn30Days,
        ),
        expiringIn15Days: indicator(
          'subscriptions',
          expiringFilter(15),
          counts.expiringIn15Days,
        ),
        expiringIn7Days: indicator('subscriptions', expiringFilter(7), counts.expiringIn7Days),
        expiredSubscriptions: indicator(
          'subscriptions',
          { status: 'expired', ...owner },
          counts.expiredSubscriptions,
        ),
        renewalsPendingResponse: indicator(
          'subscriptions',
          { followUpStatus: 'awaiting_client', ...owner },
          counts.renewalsPendingResponse,
        ),
        overdueTasks: indicator(
          'renewal-tasks',
          { status: 'pending,in_progress', overdue: 'true', ...assignee },
          counts.overdueTasks,
        ),
        upcomingTasks: indicator(
          'renewal-tasks',
          { status: 'pending,in_progress', dueFrom: today, ...assignee },
          counts.upcomingTasks,
        ),
        newRenewalRequests: indicator(
          'renewal-requests',
          { status: 'pending_review', ...assigned },
          counts.newRenewalRequests,
        ),
      };
    });
  }
}
