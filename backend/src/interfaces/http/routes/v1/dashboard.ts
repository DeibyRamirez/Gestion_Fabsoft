import {
  DashboardActivityQuerySchema,
  DashboardSummaryQuerySchema,
  type DashboardActivity,
} from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import type { GetDashboardActivity } from '../../../../application/dashboard/get-dashboard-activity/use-case.js';
import type { GetDashboardSummary } from '../../../../application/dashboard/get-dashboard-summary/use-case.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';
import { toAuditLogDto } from './audit-logs.js';

export interface DashboardRouteDeps {
  getDashboardSummary: GetDashboardSummary;
  getDashboardActivity: GetDashboardActivity;
}

export function dashboardRouter(deps: DashboardRouteDeps, guards: RequestHandler[]): Router {
  const router = Router();
  const staff = [...guards, requireRole('admin', 'operator')];

  router.get('/dashboard/summary', ...staff, async (req, res) => {
    const query = DashboardSummaryQuerySchema.parse(req.query);
    res.json(await deps.getDashboardSummary.execute(actorOf(res), query));
  });

  router.get('/dashboard/activity', ...staff, async (req, res) => {
    const query = DashboardActivityQuerySchema.parse(req.query);
    const logs = await deps.getDashboardActivity.execute(actorOf(res), query.limit);
    const body: DashboardActivity = { data: logs.map(toAuditLogDto) };
    res.json(body);
  });

  return router;
}
