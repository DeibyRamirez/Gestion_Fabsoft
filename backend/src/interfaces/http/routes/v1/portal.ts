import {
  PortalRenewalRequestListQuerySchema,
  PortalSubscriptionListQuerySchema,
  RenewalRequestCreateSchema,
  type PortalMe,
  type PortalPeriod,
  type PortalRenewalRequest,
  type PortalRenewalRequestPage,
  type PortalSubscription,
  type PortalSubscriptionPage,
} from '@fabsoft/shared';
import { API_VERSION_PREFIX } from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { CreateRenewalRequest } from '../../../../application/renewal-requests/create-renewal-request/use-case.js';
import type { ProcessRenewalRequestCreated } from '../../../../application/renewal-requests/process-created/use-case.js';
import type { GetPortalMe } from '../../../../application/portal/get-portal-me/use-case.js';
import type { GetPortalRenewalRequest } from '../../../../application/portal/get-portal-renewal-request/use-case.js';
import type { GetPortalSubscription } from '../../../../application/portal/get-portal-subscription/use-case.js';
import type { ListPortalRenewalRequests } from '../../../../application/portal/list-portal-renewal-requests/use-case.js';
import type { ListPortalSubscriptionPeriods } from '../../../../application/portal/list-portal-subscription-periods/use-case.js';
import type { ListPortalSubscriptions } from '../../../../application/portal/list-portal-subscriptions/use-case.js';
import type {
  CreatedRenewalRequestView,
  PortalMeView,
  PortalPeriodView,
  PortalRenewalRequestView,
  PortalSubscriptionView,
} from '../../../../application/portal/shared/portal-views.js';
import { toBogotaLocalDate } from '../../../../domain/subscriptions/bogota-date.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface PortalRouteDeps {
  getPortalMe: GetPortalMe;
  listPortalSubscriptions: ListPortalSubscriptions;
  getPortalSubscription: GetPortalSubscription;
  listPortalSubscriptionPeriods: ListPortalSubscriptionPeriods;
  listPortalRenewalRequests: ListPortalRenewalRequests;
  getPortalRenewalRequest: GetPortalRenewalRequest;
  createRenewalRequest: CreateRenewalRequest;
  processRenewalRequestCreated: ProcessRenewalRequestCreated;
}

const IdSchema = z.string().uuid();
const DAY_MS = 86_400_000;

const daysUntil = (end: string, today: string): number =>
  Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);

const formatAmount = (value: number): string => value.toFixed(2);

const toPortalMe = (view: PortalMeView): PortalMe => ({
  user: view.user,
  organization: view.organization,
  contactChannel: view.contactChannel,
});

const toPortalSubscription = (
  view: PortalSubscriptionView,
  today: string,
): PortalSubscription => ({
  id: view.id,
  productName: view.productName,
  contractReference: view.contractReference,
  startDate: view.startDate,
  currentPeriodEnd: view.currentPeriodEnd,
  daysUntilExpiration: daysUntil(view.currentPeriodEnd, today),
  billingCycle: view.billingCycle,
  priceAmount: formatAmount(view.priceAmount),
  currency: view.currency,
  status: view.status,
  renewalTerms: view.renewalTerms,
  hasOpenRenewalRequest: view.hasOpenRenewalRequest,
});

const toPortalPeriod = (view: PortalPeriodView): PortalPeriod => ({
  periodNumber: view.periodNumber,
  startDate: view.startDate,
  endDate: view.endDate,
  billingCycle: view.billingCycle,
  priceAmount: formatAmount(view.priceAmount),
  currency: view.currency,
  renewalOutcome: view.renewalOutcome,
});

const toPortalRenewalRequest = (view: PortalRenewalRequestView): PortalRenewalRequest => ({
  id: view.id,
  subscriptionId: view.subscriptionId,
  ...(view.productName ? { productName: view.productName } : {}),
  comment: view.comment,
  status: view.status,
  resolution: view.resolution,
  resolutionNote: view.resolutionNote,
  createdAt: view.createdAt.toISOString(),
  resolvedAt: view.resolvedAt?.toISOString() ?? null,
});

const toCreatedPortalRenewalRequest = (
  view: CreatedRenewalRequestView,
): PortalRenewalRequest => ({
  id: view.id,
  subscriptionId: view.subscriptionId,
  productName: view.productName,
  comment: view.comment,
  status: view.status,
  resolution: null,
  resolutionNote: null,
  createdAt: view.createdAt.toISOString(),
  resolvedAt: null,
});

/** Portal de clientes: sólo rol `client`; el clientId sale del actor y de RLS. */
export function portalRouter(
  deps: PortalRouteDeps,
  guards: RequestHandler[],
  createIdempotency: RequestHandler,
): Router {
  const router = Router();
  const clientGuards = [...guards, requireRole('client')];

  router.get('/portal/me', ...clientGuards, async (_req, res) => {
    res.json(toPortalMe(await deps.getPortalMe.execute(actorOf(res))));
  });

  router.get('/portal/subscriptions', ...clientGuards, async (req, res) => {
    const query = PortalSubscriptionListQuerySchema.parse(req.query);
    const result = await deps.listPortalSubscriptions.execute(actorOf(res), query);
    const today = toBogotaLocalDate(new Date());
    const body: PortalSubscriptionPage = {
      data: result.items.map((item) => toPortalSubscription(item, today)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
    res.json(body);
  });

  router.get('/portal/subscriptions/:id', ...clientGuards, async (req, res) => {
    const subscription = await deps.getPortalSubscription.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json(toPortalSubscription(subscription, toBogotaLocalDate(new Date())));
  });

  router.get('/portal/subscriptions/:id/periods', ...clientGuards, async (req, res) => {
    const periods = await deps.listPortalSubscriptionPeriods.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json({ data: periods.map(toPortalPeriod) });
  });

  router.get('/portal/renewal-requests', ...clientGuards, async (req, res) => {
    const query = PortalRenewalRequestListQuerySchema.parse(req.query);
    const result = await deps.listPortalRenewalRequests.execute(actorOf(res), query);
    const body: PortalRenewalRequestPage = {
      data: result.items.map(toPortalRenewalRequest),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
    res.json(body);
  });

  router.post('/portal/renewal-requests', ...clientGuards, createIdempotency, async (req, res) => {
    const input = RenewalRequestCreateSchema.parse(req.body);
    const created = await deps.createRenewalRequest.execute(actorOf(res), input);
    await deps.processRenewalRequestCreated.execute(created.id);
    res.setHeader(
      'Location',
      `${API_VERSION_PREFIX}/portal/renewal-requests/${created.id}`,
    );
    res.status(201).json(toCreatedPortalRenewalRequest(created));
  });

  router.get('/portal/renewal-requests/:id', ...clientGuards, async (req, res) => {
    const request = await deps.getPortalRenewalRequest.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json(toPortalRenewalRequest(request));
  });

  return router;
}
