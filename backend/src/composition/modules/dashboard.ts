import { GetDashboardActivity } from '../../application/dashboard/get-dashboard-activity/use-case.js';
import { GetDashboardSummary } from '../../application/dashboard/get-dashboard-summary/use-case.js';
import type { Infra } from '../infra.js';

export function dashboardModule(infra: Infra) {
  return {
    getDashboardSummary: new GetDashboardSummary(infra.userUow, infra.clock),
    getDashboardActivity: new GetDashboardActivity(infra.userUow),
  };
}
