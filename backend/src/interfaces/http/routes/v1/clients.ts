import {
  ClientArchiveSchema,
  ClientCreateSchema,
  ClientListQuerySchema,
  ClientUpdateSchema,
  type ClientDto,
  type ClientPage,
} from '@fabsoft/shared';
import { API_VERSION_PREFIX } from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { ArchiveClient } from '../../../../application/clients/archive-client/use-case.js';
import type { CreateClient } from '../../../../application/clients/create-client/use-case.js';
import type { GetClient } from '../../../../application/clients/get-client/use-case.js';
import type { ListClients } from '../../../../application/clients/list-clients/use-case.js';
import type { ReactivateClient } from '../../../../application/clients/reactivate-client/use-case.js';
import type { ClientView } from '../../../../application/clients/shared/client-view.js';
import type { UpdateClient } from '../../../../application/clients/update-client/use-case.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface ClientsRouteDeps {
  listClients: ListClients;
  getClient: GetClient;
  createClient: CreateClient;
  updateClient: UpdateClient;
  archiveClient: ArchiveClient;
  reactivateClient: ReactivateClient;
}

const IdSchema = z.string().uuid();

export const toClientDto = (c: ClientView): ClientDto => ({
  id: c.id,
  legalName: c.legalName,
  taxId: c.taxId,
  status: c.status,
  email: c.email,
  phone: c.phone,
  owner: c.owner,
  archivedAt: c.archivedAt?.toISOString() ?? null,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

/** /clients: lectura y alta admin+operator; archivar/reactivar sólo admin. */
export function clientsRouter(
  deps: ClientsRouteDeps,
  guards: RequestHandler[],
  createIdempotency: RequestHandler,
): Router {
  const router = Router();
  const readGuards = [...guards, requireRole('admin', 'operator')];
  const writeGuards = [...guards, requireRole('admin', 'operator')];
  const adminGuards = [...guards, requireRole('admin')];

  router.get('/clients', ...readGuards, async (req, res) => {
    const query = ClientListQuerySchema.parse(req.query);
    const r = await deps.listClients.execute(actorOf(res), query);
    const body: ClientPage = {
      data: r.items.map(toClientDto),
      meta: {
        page: r.page,
        pageSize: r.pageSize,
        total: r.total,
        totalPages: Math.ceil(r.total / r.pageSize),
      },
    };
    res.json(body);
  });

  router.post('/clients', ...writeGuards, createIdempotency, async (req, res) => {
    const client = await deps.createClient.execute(
      actorOf(res),
      ClientCreateSchema.parse(req.body),
    );
    res.setHeader('Location', `${API_VERSION_PREFIX}/clients/${client.id}`);
    res.status(201).json(toClientDto(client));
  });

  router.get('/clients/:id', ...readGuards, async (req, res) => {
    res.json(toClientDto(await deps.getClient.execute(actorOf(res), IdSchema.parse(req.params.id))));
  });

  router.patch('/clients/:id', ...writeGuards, async (req, res) => {
    const client = await deps.updateClient.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      ClientUpdateSchema.parse(req.body),
    );
    res.json(toClientDto(client));
  });

  router.post('/clients/:id/archive', ...adminGuards, async (req, res) => {
    const client = await deps.archiveClient.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      ClientArchiveSchema.parse(req.body),
    );
    res.json(toClientDto(client));
  });

  router.post('/clients/:id/reactivate', ...adminGuards, async (req, res) => {
    const client = await deps.reactivateClient.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json(toClientDto(client));
  });

  return router;
}