import {
  RenewalRequestCreateSchema,
  RenewalRequestListQuerySchema,
  type RenewalRequestDto,
  type RenewalRequestPage,
} from '@fabsoft/shared';
import { API_VERSION_PREFIX } from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { CreateRenewalRequest } from '../../../../application/renewal-requests/create-renewal-request/use-case.js';
import type { GetRenewalRequest } from '../../../../application/renewal-requests/get-renewal-request/use-case.js';
import type { ListRenewalRequests } from '../../../../application/renewal-requests/list-renewal-requests/use-case.js';
import type { RenewalRequestView } from '../../../../application/renewal-requests/list-renewal-requests/ports.js';
import type { ProcessRenewalRequestCreated } from '../../../../application/renewal-requests/process-created/use-case.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface RenewalRequestsRouteDeps {
  listRenewalRequests: ListRenewalRequests;
  getRenewalRequest: GetRenewalRequest;
  createRenewalRequest: CreateRenewalRequest;
  processRenewalRequestCreated: ProcessRenewalRequestCreated;
}

const IdSchema = z.string().uuid();

export const toRenewalRequestDto = (request: RenewalRequestView): RenewalRequestDto => ({
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
  createIdempotency: RequestHandler,
): Router {
  const router = Router();
  const staff = [...guards, requireRole('admin', 'operator')];

  router.get('/renewal-requests', ...staff, async (req, res) => {
    const query = RenewalRequestListQuerySchema.parse(req.query);
    const result = await deps.listRenewalRequests.execute(actorOf(res), query);
    const body: RenewalRequestPage = {
      data: result.items.map(toRenewalRequestDto),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
    res.json(body);
  });

  router.get('/renewal-requests/:id', ...staff, async (req, res) => {
    const request = await deps.getRenewalRequest.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json(toRenewalRequestDto(request));
  });

  router.post('/renewal-requests', ...staff, createIdempotency, async (req, res) => {
    const input = RenewalRequestCreateSchema.parse(req.body);
    const created = await deps.createRenewalRequest.execute(actorOf(res), input);
    await deps.processRenewalRequestCreated.execute(created.id);
    res.setHeader('Location', `${API_VERSION_PREFIX}/renewal-requests/${created.id}`);
    res.status(201).json({
      id: created.id,
      subscriptionId: created.subscriptionId,
      clientId: created.clientId,
      requestedBy: created.requestedBy,
      comment: created.comment,
      status: created.status,
      assignedUser: null,
      resolution: null,
      resolutionNote: null,
      resolvedAt: null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    });
  });

  return router;
}
