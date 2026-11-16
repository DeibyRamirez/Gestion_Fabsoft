import {
  RenewInputSchema,
  SubscriptionCancelSchema,
  SubscriptionCreateSchema,
  SubscriptionListQuerySchema,
  SubscriptionUpdateSchema,
  SubscriptionVersionSchema,
  type SubscriptionDetailDto,
  type SubscriptionDto,
  type SubscriptionPeriodDto,
} from '@fabsoft/shared';
import { API_VERSION_PREFIX } from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { ActivateSubscription } from '../../../../application/subscriptions/activate-subscription/use-case.js';
import type { CancelSubscription } from '../../../../application/subscriptions/cancel-subscription/use-case.js';
import type { CreateSubscription } from '../../../../application/subscriptions/create-subscription/use-case.js';
import type { GetSubscription } from '../../../../application/subscriptions/get-subscription/use-case.js';
import type { ListSubscriptionPeriods } from '../../../../application/subscriptions/list-subscription-periods/use-case.js';
import type { ListSubscriptions } from '../../../../application/subscriptions/list-subscriptions/use-case.js';
import type { RenewSubscription } from '../../../../application/subscriptions/renew-subscription/use-case.js';
import type { SubscriptionView } from '../../../../application/subscriptions/shared/subscription-view.js';
import type { UpdateSubscription } from '../../../../application/subscriptions/update-subscription/use-case.js';
import { toBogotaLocalDate } from '../../../../domain/subscriptions/bogota-date.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface SubscriptionsRouteDeps {
  listSubscriptions: ListSubscriptions;
  getSubscription: GetSubscription;
  createSubscription: CreateSubscription;
  activateSubscription: ActivateSubscription;
  updateSubscription: UpdateSubscription;
  cancelSubscription: CancelSubscription;
  renewSubscription: RenewSubscription;
  listSubscriptionPeriods: ListSubscriptionPeriods;
}

const IdSchema = z.string().uuid();
const DAY_MS = 86_400_000;

const daysUntil = (end: string, today: string): number =>
  Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);

const amountToNumber = (value: string): number => Number(value);
const formatAmount = (value: number): string => value.toFixed(2);

export const toSubscriptionPeriodDto = (
  p: NonNullable<SubscriptionView['currentPeriod']>,
): SubscriptionPeriodDto => ({
  id: p.id,
  periodNumber: p.periodNumber,
  startDate: p.startDate,
  endDate: p.endDate,
  billingCycle: p.billingCycle,
  priceAmount: formatAmount(p.priceAmount),
  currency: p.currency,
  renewalOutcome: p.renewalOutcome,
  outcomeReason: p.outcomeReason,
  paymentStatus: p.paymentStatus,
  confirmedAt: p.confirmedAt?.toISOString() ?? null,
  confirmedBy: p.confirmedBy,
  contractReference: p.contractReference,
});

export const toSubscriptionDto = (s: SubscriptionView, today: string): SubscriptionDto => ({
  id: s.id,
  client: s.client,
  product: s.product,
  contractReference: s.contractReference,
  startDate: s.startDate,
  currentPeriodEnd: s.currentPeriodEnd,
  daysUntilExpiration: daysUntil(s.currentPeriodEnd, today),
  billingCycle: s.billingCycle,
  customCycleMonths: s.customCycleMonths,
  priceAmount: formatAmount(s.priceAmount),
  currency: s.currency,
  status: s.status,
  followUpStatus: s.followUpStatus,
  currentPaymentStatus: s.currentPeriod?.paymentStatus ?? null,
  isRenewable: s.isRenewable,
  owner: s.owner,
  version: s.version,
});

export const toSubscriptionDetailDto = (
  s: SubscriptionView,
  today: string,
): SubscriptionDetailDto => ({
  ...toSubscriptionDto(s, today),
  supplierCostAmount: s.supplierCostAmount === null ? null : formatAmount(s.supplierCostAmount),
  renewalTerms: s.renewalTerms,
  visibleInPortal: s.visibleInPortal,
  notes: s.notes,
  currentPeriod: s.currentPeriod ? toSubscriptionPeriodDto(s.currentPeriod) : null,
  cancelledAt: s.cancelledAt?.toISOString() ?? null,
  cancellationReason: s.cancellationReason,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
});

/** /subscriptions: lectura/alta/edición admin+operator; cancelar sólo admin. */
export function subscriptionsRouter(
  deps: SubscriptionsRouteDeps,
  guards: RequestHandler[],
  createIdempotency: RequestHandler,
): Router {
  const router = Router();
  const readGuards = [...guards, requireRole('admin', 'operator')];
  const writeGuards = [...guards, requireRole('admin', 'operator')];
  const adminGuards = [...guards, requireRole('admin')];

  router.get('/subscriptions', ...readGuards, async (req, res) => {
    const query = SubscriptionListQuerySchema.parse(req.query);
    const result = await deps.listSubscriptions.execute(actorOf(res), query);
    const today = toBogotaLocalDate(new Date());
    res.json({
      data: result.items.map((s) => toSubscriptionDto(s, today)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    });
  });

  router.post('/subscriptions', ...writeGuards, createIdempotency, async (req, res) => {
    const input = SubscriptionCreateSchema.parse(req.body);
    const { priceAmount, supplierCostAmount, ...rest } = input;
    const created = await deps.createSubscription.execute(actorOf(res), {
      ...rest,
      priceAmount: amountToNumber(priceAmount),
      ...(supplierCostAmount !== undefined
        ? {
            supplierCostAmount:
              supplierCostAmount === null ? null : amountToNumber(supplierCostAmount),
          }
        : {}),
    });
    res.setHeader('Location', `${API_VERSION_PREFIX}/subscriptions/${created.id}`);
    res.status(201).json(toSubscriptionDetailDto(created, toBogotaLocalDate(new Date())));
  });

  router.get('/subscriptions/:id', ...readGuards, async (req, res) => {
    const subscription = await deps.getSubscription.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json(toSubscriptionDetailDto(subscription, toBogotaLocalDate(new Date())));
  });

  router.post('/subscriptions/:id/activate', ...writeGuards, async (req, res) => {
    const { version } = SubscriptionVersionSchema.parse(req.body);
    const updated = await deps.activateSubscription.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      version,
    );
    res.json(toSubscriptionDetailDto(updated, toBogotaLocalDate(new Date())));
  });

  router.patch('/subscriptions/:id', ...writeGuards, async (req, res) => {
    const input = SubscriptionUpdateSchema.parse(req.body);
    const { priceAmount, supplierCostAmount, ...rest } = input;
    const updated = await deps.updateSubscription.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      {
        ...rest,
        ...(priceAmount !== undefined ? { priceAmount: amountToNumber(priceAmount) } : {}),
        ...(supplierCostAmount !== undefined
          ? {
              supplierCostAmount:
                supplierCostAmount === null ? null : amountToNumber(supplierCostAmount),
            }
          : {}),
      },
    );
    res.json(toSubscriptionDetailDto(updated, toBogotaLocalDate(new Date())));
  });

  router.post('/subscriptions/:id/cancel', ...adminGuards, async (req, res) => {
    const updated = await deps.cancelSubscription.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      SubscriptionCancelSchema.parse(req.body),
    );
    res.json(toSubscriptionDetailDto(updated, toBogotaLocalDate(new Date())));
  });

  router.get('/subscriptions/:id/periods', ...readGuards, async (req, res) => {
    const periods = await deps.listSubscriptionPeriods.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json({ data: periods.map(toSubscriptionPeriodDto) });
  });

  router.post('/subscriptions/:id/renew', ...writeGuards, createIdempotency, async (req, res) => {
    const input = RenewInputSchema.parse(req.body);
    const { newPeriod, ...rest } = input;
    const { priceAmount, supplierCostAmount, ...periodRest } = newPeriod;
    const updated = await deps.renewSubscription.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      {
        ...rest,
        newPeriod: {
          ...periodRest,
          priceAmount: amountToNumber(priceAmount),
          ...(supplierCostAmount !== undefined
            ? {
                supplierCostAmount:
                  supplierCostAmount === null ? null : amountToNumber(supplierCostAmount),
              }
            : {}),
        },
      },
    );
    res.json(toSubscriptionDetailDto(updated, toBogotaLocalDate(new Date())));
  });

  return router;
}
