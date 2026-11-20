import {
  ClientListQuerySchema,
  ProductListQuerySchema,
  RenewalRequestCreateSchema,
  RenewalRequestListQuerySchema,
  SubscriptionListQuerySchema,
  TaskListQuerySchema,
  type ClientPage,
  type ProductPage,
  type RenewalRequestDto,
  type RenewalRequestPage,
  type SubscriptionPage,
  type TaskPage,
} from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Clock } from '../../../../application/shared/ports.js';
import type { AuthenticateApiKey } from '../../../../application/integrations/authenticate-api-key/use-case.js';
import type { IntegrationRateLimiter } from '../../../../application/integrations/shared/rate-limit.js';
import type {
  CreateIntegrationRenewalRequest,
  GetIntegrationClient,
  GetIntegrationProduct,
  GetIntegrationRenewalRequest,
  GetIntegrationSubscription,
  GetIntegrationTask,
  ListIntegrationClients,
  ListIntegrationProducts,
  ListIntegrationRenewalRequests,
  ListIntegrationSubscriptions,
  ListIntegrationSubscriptionPeriods,
  ListIntegrationTasks,
} from '../../../../application/integrations/public-api/use-cases.js';
import type { ProcessRenewalRequestCreated } from '../../../../application/renewal-requests/process-created/use-case.js';
import { addDays } from '../../../../domain/subscriptions/local-date.js';
import { toBogotaLocalDate } from '../../../../domain/subscriptions/bogota-date.js';
import { integrationActorOf } from '../../middlewares/authenticate.js';
import { authenticateApiKey, requireScope } from '../../middlewares/authenticate.js';
import { integrationRateLimit } from '../../middlewares/integration-rate-limit.js';
import { toClientDto } from './clients.js';
import { toProductDto } from './products.js';
import { toRenewalRequestDto } from './renewal-requests.js';
import { toSubscriptionDto, toSubscriptionPeriodDto } from './subscriptions.js';
import { toTaskDto } from './tasks.js';

export interface IntegrationApiRouteDeps {
  authenticateApiKey: AuthenticateApiKey;
  integrationRateLimiter: IntegrationRateLimiter;
  clock: Clock;
  listIntegrationClients: ListIntegrationClients;
  getIntegrationClient: GetIntegrationClient;
  listIntegrationProducts: ListIntegrationProducts;
  getIntegrationProduct: GetIntegrationProduct;
  listIntegrationSubscriptions: ListIntegrationSubscriptions;
  getIntegrationSubscription: GetIntegrationSubscription;
  listIntegrationSubscriptionPeriods: ListIntegrationSubscriptionPeriods;
  listIntegrationRenewalRequests: ListIntegrationRenewalRequests;
  getIntegrationRenewalRequest: GetIntegrationRenewalRequest;
  createIntegrationRenewalRequest: CreateIntegrationRenewalRequest;
  processRenewalRequestCreated: ProcessRenewalRequestCreated;
  listIntegrationTasks: ListIntegrationTasks;
  getIntegrationTask: GetIntegrationTask;
}

const IdSchema = z.string().uuid();
const withinDaysSchema = z.coerce.number().int().min(0).max(365).default(30);

type ExpiringSubscriptionPage = SubscriptionPage & {
  meta: SubscriptionPage['meta'] & { today: string; withinDays: number };
};

export function integrationApiRouter(
  deps: IntegrationApiRouteDeps,
  createIdempotency: RequestHandler,
): Router {
  const router = Router();
  router.use((req, _res, next) => {
    if (!req.header('x-api-key')) return next('router');
    next();
  });

  const keyGuards = [
    authenticateApiKey(deps.authenticateApiKey),
    integrationRateLimit(deps.integrationRateLimiter, deps.clock),
  ];

  router.get('/clients', ...keyGuards, requireScope('clients:read'), async (req, res) => {
    const query = ClientListQuerySchema.parse(req.query);
    const result = await deps.listIntegrationClients.execute(integrationActorOf(res), query);
    const body: ClientPage = {
      data: result.items.map(toClientDto),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
    res.json(body);
  });

  router.get('/clients/:id', ...keyGuards, requireScope('clients:read'), async (req, res) => {
    const client = await deps.getIntegrationClient.execute(
      integrationActorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json(toClientDto(client));
  });

  router.get('/products', ...keyGuards, requireScope('products:read'), async (req, res) => {
    const query = ProductListQuerySchema.parse(req.query);
    const result = await deps.listIntegrationProducts.execute(integrationActorOf(res), query);
    const body: ProductPage = {
      data: result.items.map(toProductDto),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
    res.json(body);
  });

  router.get('/products/:id', ...keyGuards, requireScope('products:read'), async (req, res) => {
    const product = await deps.getIntegrationProduct.execute(
      integrationActorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json(toProductDto(product));
  });

  router.get('/subscriptions/expiring', ...keyGuards, requireScope('subscriptions:read'), async (req, res) => {
    const withinDays = withinDaysSchema.parse(req.query.withinDays);
    const today = toBogotaLocalDate(deps.clock.now());
    const query = SubscriptionListQuerySchema.parse({
      page: req.query.page,
      pageSize: req.query.pageSize,
      clientId: req.query.clientId,
      status: 'activa,en_renovacion',
      expiresFrom: today,
      expiresTo: addDays(today, withinDays),
      sort: 'currentPeriodEnd',
    });
    const result = await deps.listIntegrationSubscriptions.execute(
      integrationActorOf(res),
      query,
    );
    const body: ExpiringSubscriptionPage = {
      data: result.items.map((item) => toSubscriptionDto(item, today)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
        today,
        withinDays,
      },
    };
    res.json(body);
  });

  router.get('/subscriptions', ...keyGuards, requireScope('subscriptions:read'), async (req, res) => {
    const query = SubscriptionListQuerySchema.parse(req.query);
    const today = toBogotaLocalDate(deps.clock.now());
    const result = await deps.listIntegrationSubscriptions.execute(
      integrationActorOf(res),
      query,
    );
    const body: SubscriptionPage = {
      data: result.items.map((item) => toSubscriptionDto(item, today)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
    res.json(body);
  });

  router.get('/subscriptions/:id', ...keyGuards, requireScope('subscriptions:read'), async (req, res) => {
    const subscription = await deps.getIntegrationSubscription.execute(
      integrationActorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json(toSubscriptionDto(subscription, toBogotaLocalDate(deps.clock.now())));
  });

  router.get(
    '/subscriptions/:id/periods',
    ...keyGuards,
    requireScope('subscriptions:read'),
    async (req, res) => {
      const periods = await deps.listIntegrationSubscriptionPeriods.execute(
        integrationActorOf(res),
        IdSchema.parse(req.params.id),
      );
      res.json({ data: periods.map(toSubscriptionPeriodDto) });
    },
  );

  router.get(
    '/renewal-requests',
    ...keyGuards,
    requireScope('renewal-requests:read'),
    async (req, res) => {
      const query = RenewalRequestListQuerySchema.parse(req.query);
      const result = await deps.listIntegrationRenewalRequests.execute(
        integrationActorOf(res),
        query,
      );
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
    },
  );

  router.post(
    '/renewal-requests',
    ...keyGuards,
    requireScope('subscriptions:read'),
    requireScope('renewal-requests:write'),
    createIdempotency,
    async (req, res) => {
      const input = RenewalRequestCreateSchema.parse(req.body);
      const created = await deps.createIntegrationRenewalRequest.execute(
        integrationActorOf(res),
        input,
      );
      await deps.processRenewalRequestCreated.execute(created.id);
      const body: RenewalRequestDto = {
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
      };
      res.setHeader('Location', `/api/v1/renewal-requests/${created.id}`);
      res.status(201).json(body);
    },
  );

  router.get(
    '/renewal-requests/:id',
    ...keyGuards,
    requireScope('renewal-requests:read'),
    async (req, res) => {
      const request = await deps.getIntegrationRenewalRequest.execute(
        integrationActorOf(res),
        IdSchema.parse(req.params.id),
      );
      res.json(toRenewalRequestDto(request));
    },
  );

  router.get('/renewal-tasks', ...keyGuards, requireScope('renewal-tasks:read'), async (req, res) => {
    const query = TaskListQuerySchema.parse(req.query);
    const result = await deps.listIntegrationTasks.execute(integrationActorOf(res), query);
    const today = toBogotaLocalDate(deps.clock.now());
    const body: TaskPage = {
      data: result.items.map((item) => toTaskDto(item, today)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
    res.json(body);
  });

  router.get('/renewal-tasks/:id', ...keyGuards, requireScope('renewal-tasks:read'), async (req, res) => {
    const task = await deps.getIntegrationTask.execute(
      integrationActorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json(toTaskDto(task, toBogotaLocalDate(deps.clock.now())));
  });

  return router;
}
