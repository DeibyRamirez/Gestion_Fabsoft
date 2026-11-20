import {
  RenewalRequestListQuerySchema,
  type RenewalRequestDto,
  type RenewalRequestPage,
} from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import type { ListRenewalRequests } from '../../../../application/renewal-requests/list-renewal-requests/use-case.js';
import type { RenewalRequestView } from '../../../../application/renewal-requests/list-renewal-requests/ports.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface RenewalRequestsRouteDeps {
  listRenewalRequests: ListRenewalRequests;
}

const toDto = (request: RenewalRequestView): RenewalRequestDto => ({
  id: request.id,
  subscriptionId: request.subscriptionId,
  clientId: request.clientId,
  requestedBy: request.requestedBy,
  comment: request.comment,
  status: request.status,
  assignedUser: request.assignedUser,
  resolution: request.resolution,
  resolutionNote: request.resolutionNote,
  resolvedAt: request.resolvedAt?.toISOString() ?? null,
  createdAt: request.createdAt.toISOString(),
  updatedAt: request.updatedAt.toISOString(),
});

export function renewalRequestsRouter(
  deps: RenewalRequestsRouteDeps,
  guards: RequestHandler[],
): Router {
  const router = Router();
  const staff = [...guards, requireRole('admin', 'operator')];

  router.get('/renewal-requests', ...staff, async (req, res) => {
    const query = RenewalRequestListQuerySchema.parse(req.query);
    const result = await deps.listRenewalRequests.execute(actorOf(res), query);
    const body: RenewalRequestPage = {
      data: result.items.map(toDto),
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
