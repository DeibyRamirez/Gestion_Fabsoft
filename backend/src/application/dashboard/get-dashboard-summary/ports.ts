import type { LocalDate } from '../../../domain/subscriptions/local-date.js';

export interface DashboardCounts {
  activeSubscriptions: number;
  expiringIn30Days: number;
  expiringIn15Days: number;
  expiringIn7Days: number;
  expiredSubscriptions: number;
  renewalsPendingResponse: number;
  overdueTasks: number;
  upcomingTasks: number;
  newRenewalRequests: number;
}

export interface GetDashboardSummaryQuery {
  counts(today: LocalDate, ownerUserId: string | null): Promise<DashboardCounts>;
}

export interface GetDashboardSummaryRepos {
  dashboardSummary: GetDashboardSummaryQuery;
}
