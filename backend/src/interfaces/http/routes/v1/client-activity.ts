import { ClientActivityQuerySchema, type ClientActivityPage } from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { ListClientActivity } from '../../../../application/clients/list-client-activity/use-case.js';
import type { ClientActivityView } from '../../../../application/clients/shared/client-activity-view.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

const IdSchema = z.string().uuid();

export interface ClientActivityRouteDeps {
  listClientActivity: ListClientActivity;
}

export const toClientActivityDto = (a: ClientActivityView) => ({
  id: a.id,
  occurredAt: a.occurredAt.toISOString(),
  actor: a.actor,
  action: a.action,
  resourceType: a.resourceType,
  resourceId: a.resourceId,
  summary: a.summary,
});

export function clientActivityRouter(
  deps: ClientActivityRouteDeps,
  guards: RequestHandler[],
): Router {
  const router = Router();
  const readGuards = [...guards, requireRole('admin', 'operator')];

  router.get('/clients/:id/activity', ...readGuards, async (req, res) => {
    const { page, pageSize } = ClientActivityQuerySchema.parse(req.query);
    const clientId = IdSchema.parse(req.params.id);
    const result = await deps.listClientActivity.execute(actorOf(res), clientId, page, pageSize);
    const body: ClientActivityPage = {
      data: result.items.map(toClientActivityDto),
      meta: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
    res.json(body);
  });

  return router;
}
