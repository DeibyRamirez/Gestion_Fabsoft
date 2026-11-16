import type { BillingCycle, PaymentStatus } from '@fabsoft/shared';
import { buildInitialPeriod } from '../../../domain/subscriptions/period.js';
import { resolveSubscription } from '../../../domain/subscriptions/subscription.js';
import type { GetClientQuery } from '../../clients/get-client/ports.js';
import type { GetProductQuery } from '../../products/get-product/ports.js';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, UnitOfWork } from '../../shared/ports.js';
import { subscriptionAuditSnapshot } from '../shared/subscription-audit.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { CreateSubscriptionRepos } from './ports.js';

type CreateSubscriptionUow = CreateSubscriptionRepos & {
  audit: AuditWriter;
  clientDetail: GetClientQuery;
  productDetail: GetProductQuery;
};

export interface CreateSubscriptionInput {
  clientId: string;
  productId: string;
  contractReference?: string | null | undefined;
  startDate: string;
  currentPeriodEnd?: string | undefined;
  billingCycle: BillingCycle;
  customCycleMonths?: number | null | undefined;
  priceAmount: number;
  currency?: 'COP' | undefined;
  supplierCostAmount?: number | null | undefined;
  renewalTerms?: string | null | undefined;
  isRenewable?: boolean | undefined;
  visibleInPortal?: boolean | undefined;
  ownerUserId?: string | null | undefined;
  notes?: string | null | undefined;
  initialPaymentStatus?: PaymentStatus | undefined;
}

/**
 * Alta de suscripción (HU-06): cliente no archivado + producto activo, periodo 1,
 * precio congelado y estado `pending_activation` (la activación es aparte).
 */
export class CreateSubscription {
  constructor(private readonly uow: UnitOfWork<CreateSubscriptionUow>) {}

  async execute(actor: UserActor, input: CreateSubscriptionInput): Promise<SubscriptionView> {
    requireRole(actor, 'admin', 'operator');
    if (input.supplierCostAmount != null && actor.role !== 'admin') {
      throw new ApplicationError('forbidden', 'Sólo un admin puede fijar el costo del proveedor');
    }

    const resolved = resolveSubscription({
      startDate: input.startDate,
      ...(input.currentPeriodEnd !== undefined ? { currentPeriodEnd: input.currentPeriodEnd } : {}),
      billingCycle: input.billingCycle,
      customCycleMonths: input.customCycleMonths ?? null,
      priceAmount: input.priceAmount,
    });
    const initialPeriod = buildInitialPeriod({
      startDate: resolved.startDate,
      endDate: resolved.currentPeriodEnd,
      billingCycle: resolved.billingCycle,
      priceAmount: resolved.priceAmount,
      ...(input.initialPaymentStatus !== undefined
        ? { paymentStatus: input.initialPaymentStatus }
        : {}),
    });

    return this.uow.run(
      actor,
      async ({ subscriptionCreate, clientDetail, productDetail, audit }) => {
        const client = await clientDetail.findById(input.clientId);
        if (!client) throw new ApplicationError('not_found', 'Cliente no encontrado');
        if (client.status === 'archived') {
          throw new ApplicationError('client_archived', 'El cliente está archivado');
        }

        const product = await productDetail.findById(input.productId);
        if (!product) throw new ApplicationError('not_found', 'Producto no encontrado');
        if (product.status !== 'active') {
          throw new ApplicationError('product_inactive', 'El producto está inactivo');
        }

        const created = await subscriptionCreate.insert({
          clientId: input.clientId,
          productId: input.productId,
          contractReference: input.contractReference ?? null,
          startDate: resolved.startDate,
          currentPeriodEnd: resolved.currentPeriodEnd,
          billingCycle: resolved.billingCycle,
          customCycleMonths: resolved.customCycleMonths,
          priceAmount: resolved.priceAmount,
          currency: input.currency ?? 'COP',
          supplierCostAmount: input.supplierCostAmount ?? null,
          renewalTerms: input.renewalTerms ?? null,
          isRenewable: input.isRenewable ?? true,
          status: resolved.status,
          visibleInPortal: input.visibleInPortal ?? true,
          ownerUserId: input.ownerUserId ?? null,
          notes: input.notes ?? null,
          createdBy: actor.userId,
          initialPeriod,
        });

        await audit.write({
          actor: { type: 'user', userId: actor.userId },
          action: 'subscription.created',
          resourceType: 'subscription',
          resourceId: created.id,
          changes: { after: subscriptionAuditSnapshot(created) },
          requestId: actor.requestId,
        });
        return created;
      },
    );
  }
}
