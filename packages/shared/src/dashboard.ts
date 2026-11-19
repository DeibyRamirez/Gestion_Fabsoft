import { z } from 'zod';
import { AuditLogSchema } from './audit.js';

export const DashboardIndicatorSchema = z.object({
  count: z.number().int().min(0),
  resource: z.enum(['subscriptions', 'renewal-tasks', 'renewal-requests']),
  filter: z.record(z.string(), z.string()),
});
export type DashboardIndicator = z.infer<typeof DashboardIndicatorSchema>;

export const DashboardSummarySchema = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activeSubscriptions: DashboardIndicatorSchema,
  expiringIn30Days: DashboardIndicatorSchema,
  expiringIn15Days: DashboardIndicatorSchema,
  expiringIn7Days: DashboardIndicatorSchema,
  expiredSubscriptions: DashboardIndicatorSchema,
  renewalsPendingResponse: DashboardIndicatorSchema,
  overdueTasks: DashboardIndicatorSchema,
  upcomingTasks: DashboardIndicatorSchema,
  newRenewalRequests: DashboardIndicatorSchema,
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

export const DashboardActivitySchema = z.object({
  data: z.array(AuditLogSchema),
});
export type DashboardActivity = z.infer<typeof DashboardActivitySchema>;

export const DashboardActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type DashboardActivityQuery = z.infer<typeof DashboardActivityQuerySchema>;
