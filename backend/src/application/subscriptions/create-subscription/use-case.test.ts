import { describe, expect, it, vi } from 'vitest';
import type { ClientView } from '../../clients/shared/client-view.js';
import type { ProductView } from '../../products/shared/product-view.js';
import type { UserActor } from '../../shared/actor.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import { CreateSubscription, type CreateSubscriptionInput } from './use-case.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'admin-id',
  role: 'admin',
  clientId: null,
  requestId: 'req-1',
};
const operator: UserActor = {
  actorType: 'user',
  userId: 'op-id',
  role: 'operator',
  clientId: null,
  requestId: 'req-2',
};
const clientUser: UserActor = {
  actorType: 'user',
  userId: 'cu',
  role: 'client',
  clientId: 'cl-1',
  requestId: 'req-3',
};

const activeClient: ClientView = {
  id: 'cl-1',
  legalName: 'Acme',
  taxId: null,
  status: 'active',
  email: null,
  phone: null,
  owner: null,
  archivedAt: null,
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
};
const archivedClient: ClientView = {
  ...activeClient,
  status: 'archived',
  archivedAt: new Date('2026-11-02T12:00:00Z'),
};
const activeProduct: ProductView = {
  id: 'pr-1',
  name: 'Microsoft 365',
  description: null,
  productType: 'third_party',
  vendor: 'Microsoft',
  referenceCode: null,
  status: 'active',
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
};
const inactiveProduct: ProductView = { ...activeProduct, status: 'inactive' };

const savedSubscription = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  id: 'sub-1',
  clientId: 'cl-1',
  productId: 'pr-1',
  client: { id: 'cl-1', legalName: 'Acme' },
  product: { id: 'pr-1', name: 'Microsoft 365' },
  contractReference: null,
  startDate: '2026-11-01',
  currentPeriodEnd: '2026-11-30',
  billingCycle: 'monthly',
  customCycleMonths: null,
  priceAmount: 100_000,
  currency: 'COP',
  supplierCostAmount: null,
  renewalTerms: null,
  isRenewable: true,
  status: 'pending_activation',
  followUpStatus: 'none',
  visibleInPortal: true,
  ownerUserId: null,
  owner: null,
  notes: null,
  cancelledAt: null,
  cancellationReason: null,
  version: 1,
  currentPeriod: {
    id: 'per-1',
    periodNumber: 1,
    startDate: '2026-11-01',
    endDate: '2026-11-30',
    billingCycle: 'monthly',
    priceAmount: 100_000,
    currency: 'COP',
    renewalOutcome: 'pending',
    outcomeReason: null,
    paymentStatus: 'pending',
    confirmedAt: null,
    confirmedBy: null,
    contractReference: null,
  },
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
  ...over,
});

const baseInput: CreateSubscriptionInput = {
  clientId: 'cl-1',
  productId: 'pr-1',
  startDate: '2026-11-01',
  billingCycle: 'monthly',
  priceAmount: 100_000,
};

function makeUc(opts: {
  client?: ClientView | null;
  product?: ProductView | null;
  saved?: SubscriptionView;
}) {
  const insert = vi.fn(async () => opts.saved ?? savedSubscription());
  const auditWrite = vi.fn(async () => undefined);
  const uc = new CreateSubscription({
    run: async (_actor, work) =>
      work({
        subscriptionCreate: { insert },
        clientDetail: {
          findById: async () => (opts.client === undefined ? activeClient : opts.client),
        },
        productDetail: {
          findById: async () => (opts.product === undefined ? activeProduct : opts.product),
        },
        audit: { write: auditWrite },
      }),
  });
  return { uc, insert, auditWrite };
}

describe('CreateSubscription', () => {
  it('rechaza rol client sin ejecutar la transacción', async () => {
    const run = vi.fn();
    const uc = new CreateSubscription({ run });
    await expect(uc.execute(clientUser, baseInput)).rejects.toMatchObject({ code: 'forbidden' });
    expect(run).not.toHaveBeenCalled();
  });

  it('operador no puede fijar supplierCostAmount', async () => {
    const run = vi.fn();
    const uc = new CreateSubscription({ run });
    await expect(
      uc.execute(operator, { ...baseInput, supplierCostAmount: 10 }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(run).not.toHaveBeenCalled();
  });

  it('ciclo custom exige customCycleMonths', async () => {
    const run = vi.fn();
    const uc = new CreateSubscription({ run });
    await expect(uc.execute(admin, { ...baseInput, billingCycle: 'custom' })).rejects.toMatchObject(
      { code: 'validation_error' },
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('cliente inexistente devuelve not_found', async () => {
    const { uc } = makeUc({ client: null });
    await expect(uc.execute(admin, baseInput)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('cliente archivado devuelve client_archived', async () => {
    const { uc } = makeUc({ client: archivedClient });
    await expect(uc.execute(admin, baseInput)).rejects.toMatchObject({ code: 'client_archived' });
  });

  it('producto inexistente devuelve not_found', async () => {
    const { uc } = makeUc({ product: null });
    await expect(uc.execute(admin, baseInput)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('producto inactivo devuelve product_inactive', async () => {
    const { uc } = makeUc({ product: inactiveProduct });
    await expect(uc.execute(admin, baseInput)).rejects.toMatchObject({ code: 'product_inactive' });
  });

  it('crea pendiente de activación con fin calculado, periodo 1 y auditoría', async () => {
    const { uc, insert, auditWrite } = makeUc({});
    const created = await uc.execute(operator, baseInput);

    expect(created.status).toBe('pending_activation');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2026-11-01',
        currentPeriodEnd: '2026-11-30',
        status: 'pending_activation',
        priceAmount: 100_000,
        createdBy: 'op-id',
        initialPeriod: expect.objectContaining({
          periodNumber: 1,
          startDate: '2026-11-01',
          endDate: '2026-11-30',
          paymentStatus: 'pending',
        }),
      }),
    );
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'subscription.created', resourceType: 'subscription' }),
    );
  });

  it('admin fija costo, pago inicial y fin explícito', async () => {
    const saved = savedSubscription({ currentPeriodEnd: '2026-12-15', supplierCostAmount: 50_000 });
    const { uc, insert } = makeUc({ saved });
    await uc.execute(admin, {
      ...baseInput,
      currentPeriodEnd: '2026-12-15',
      supplierCostAmount: 50_000,
      initialPaymentStatus: 'received',
      currency: 'COP',
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPeriodEnd: '2026-12-15',
        supplierCostAmount: 50_000,
        initialPeriod: expect.objectContaining({ paymentStatus: 'received' }),
      }),
    );
  });

  it('acepta precio 0', async () => {
    const { uc, insert } = makeUc({ saved: savedSubscription({ priceAmount: 0 }) });
    await uc.execute(admin, { ...baseInput, priceAmount: 0 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ priceAmount: 0 }));
  });

  it('admin aplica todos los campos opcionales', async () => {
    const { uc, insert } = makeUc({});
    await uc.execute(admin, {
      ...baseInput,
      contractReference: 'C-2026-01',
      renewalTerms: 'Renovación anual',
      isRenewable: false,
      visibleInPortal: false,
      ownerUserId: 'owner-1',
      notes: 'nota interna',
      supplierCostAmount: 10,
      currency: 'COP',
      initialPaymentStatus: 'not_tracked',
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        contractReference: 'C-2026-01',
        renewalTerms: 'Renovación anual',
        isRenewable: false,
        visibleInPortal: false,
        ownerUserId: 'owner-1',
        notes: 'nota interna',
        supplierCostAmount: 10,
        initialPeriod: expect.objectContaining({ paymentStatus: 'not_tracked' }),
      }),
    );
  });
});
