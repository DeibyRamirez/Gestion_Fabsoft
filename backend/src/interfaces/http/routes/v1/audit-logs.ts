import { AuditLogListQuerySchema, type AuditLogPage } from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import type { ListAuditLogs } from '../../../../application/audit/list-audit-logs/use-case.js';
import type { AuditLogView } from '../../../../application/audit/shared/audit-log-view.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface AuditLogsRouteDeps {
  listAuditLogs: ListAuditLogs;
}

export const toAuditLogDto = (a: AuditLogView) => ({
  id: a.id,
  occurredAt: a.occurredAt.toISOString(),
  actorType: a.actorType,
  actor: a.actor,
  action: a.action,
  resourceType: a.resourceType,
  resourceId: a.resourceId,
  clientId: a.clientId,
  changes: a.changes,
  reason: a.reason,
  requestId: a.requestId,
});

export function auditLogsRouter(deps: AuditLogsRouteDeps, guards: RequestHandler[]): Router {
  const router = Router();
  const adminGuards = [...guards, requireRole('admin')];

  router.get('/audit-logs', ...adminGuards, async (req, res) => {
    const query = AuditLogListQuerySchema.parse(req.query);
    const result = await deps.listAuditLogs.execute(actorOf(res), query);
    const body: AuditLogPage = {
      data: result.items.map(toAuditLogDto),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
    res.json(body);
  });

  return router;
}
