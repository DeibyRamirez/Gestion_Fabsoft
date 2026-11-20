import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { UserActor } from '../../shared/actor.js';
import { RenewSubscription } from './use-case.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'a',
  role: 'admin',
  clientId: null,
  requestId: 'r',
};
const operator: UserActor = {
  actorType: 'user',
  userId: 'o',
  role: 'operator',
  clientId: null,
  requestId: 'r',
};
const clientUser: UserActor = {
  actorType: 'user',
  userId: 'c',
  role: 'client',
  clientId: 'cl-1',
  requestId: 'r',
};

const sample = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  id: 'sub-1',
  clientId: 'cl-1',
  productId: 'pr-1',
  client: { id: 'cl-1', legalName: 'Acme' },
  product: { id: 'pr-1', name: 'M365' },
  contractReference: null,
  startDate: '2026-11-01',
  currentPeriodEnd: '2026-11-30',
  billingCycle: 'monthly',
  customCycleMonths: null,
  priceAmount: 100,
  currency: 'COP',
  supplierCostAmount: null,
  renewalTerms: null,
  isRenewable: true,
  status: 'activa',
  followUpStatus: 'sin_gestion',
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
    priceAmount: 100,
    currency: 'COP',
    renewalOutcome: 'pendiente',
    outcomeReason: null,
    paymentStatus: 'recibido',
    confirmedAt: null,
    confirmedBy: null,
    contractReference: null,
  },
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
  ...over,
});

const clock = { now: () => new Date('2026-11-14T12:00:00Z') };
const renewInput = { version: 1, newPeriod: { priceAmount: 150 } };

function makeUc(current: SubscriptionView | null, updated: SubscriptionView | null) {
  const renew = vi.fn(async () => updated);
  const auditWrite = vi.fn(async () => undefined);
  const cancelPendingForPeriod = vi.fn(async () => 1);
  const scheduleForPeriod = vi.fn(async () => 1);
  const completeAutoTasksForSubscription = vi.fn(async () => 1);
  const resolveOpenForSubscription = vi.fn(async () => 1);
  const uc = new RenewSubscription(
    {
      run: async (_a, work) =>
        work({
          subscriptionRenew: { loadForUpdate: async () => current, renew },
          alerts: {
            scheduleForPeriod,
            cancelPendingForPeriod,
            cancelPendingWithoutException: async () => 0,
            cancelAllPending: async () => 0,
            reconcile: async () => ({ scannedSubscriptions: 0, scheduled: 0, cancelled: 0 }),
          },
          tasksAutomation: {
            completeAutoTasksForSubscription,
            cancelPendingAutoTasksForPeriod: async () => 0,
            annotateInProgressAutoTasksForPeriod: async () => 0,
            cancelOpenAutoTasksForSubscription: async () => 0,
            cancelOpenTasksForSubscription: async () => 0,
          },
          renewalRequests: { resolveOpenForSubscription },
          audit: { write: auditWrite },
        }),
    },
    clock,
  );
  return {
    uc,
    renew,
    auditWrite,
    cancelPendingForPeriod,
    scheduleForPeriod,
    completeAutoTasksForSubscription,
    resolveOpenForSubscription,
  };
}

describe('RenewSubscription', () => {
  it('rechaza rol client', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(uc.execute(clientUser, 'sub-1', renewInput)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('operador no puede fijar costo del proveedor', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(
      uc.execute(operator, 'sub-1', {
        version: 1,
        newPeriod: { priceAmount: 150, supplierCostAmount: 10 },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('no encontrada devuelve not_found', async () => {
    const { uc } = makeUc(null, null);
    await expect(uc.execute(admin, 'sub-1', renewInput)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('versión vieja devuelve version_conflict', async () => {
    const { uc } = makeUc(sample({ version: 2 }), sample());
    await expect(uc.execute(admin, 'sub-1', renewInput)).rejects.toMatchObject({
      code: 'version_conflict',
    });
  });

  it.each(['pendiente_activacion', 'cancelada', 'no_renovada'] as const)(
    'no renueva desde %s',
    async (status) => {
      const { uc } = makeUc(sample({ status }), sample());
      await expect(uc.execute(admin, 'sub-1', renewInput)).rejects.toMatchObject({
        code: 'invalid_state_transition',
      });
    },
  );

  it('crea el periodo siguiente sin solapes y audita', async () => {
    const updated = sample({ currentPeriodEnd: '2026-12-31', version: 2 });
    const {
      uc,
      renew,
      auditWrite,
      cancelPendingForPeriod,
      scheduleForPeriod,
      completeAutoTasksForSubscription,
      resolveOpenForSubscription,
    } = makeUc(sample(), updated);
    const result = await uc.execute(operator, 'sub-1', renewInput);

    expect(renew).toHaveBeenCalledWith(
      'sub-1',
      1,
      expect.objectContaining({
        startDate: '2026-12-01',
        endDate: '2026-12-31',
        billingCycle: 'monthly',
        priceAmount: 150,
        paymentStatus: 'pendiente',
        confirmedAt: new Date('2026-11-14T12:00:00Z'),
      }),
      'o',
    );
    expect(result.currentPeriodEnd).toBe('2026-12-31');
    expect(cancelPendingForPeriod).toHaveBeenCalledWith('sub-1', '2026-11-30', 'renewed');
    expect(completeAutoTasksForSubscription).toHaveBeenCalledWith(
      'sub-1',
      'Renovación confirmada',
      'o',
    );
    expect(resolveOpenForSubscription).toHaveBeenCalledWith('sub-1', 'Renovación confirmada', 'o');
    expect(scheduleForPeriod).toHaveBeenCalledWith('sub-1', '2026-11-14');
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'subscription.renewed' }),
    );
  });

  it('un inicio solapado se rechaza en dominio', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(
      uc.execute(admin, 'sub-1', {
        version: 1,
        newPeriod: { priceAmount: 150, startDate: '2026-11-30' },
      }),
    ).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('admin renueva con fin, ciclo, costo, contrato y pago explícitos', async () => {
    const { uc, renew } = makeUc(sample(), sample({ currentPeriodEnd: '2027-02-04', version: 2 }));
    await uc.execute(admin, 'sub-1', {
      version: 1,
      newPeriod: {
        startDate: '2026-12-05',
        endDate: '2027-02-04',
        billingCycle: 'custom',
        customCycleMonths: 2,
        priceAmount: 150,
        supplierCostAmount: 20,
        contractReference: 'C-2',
        paymentStatus: 'sin_seguimiento',
      },
    });
    expect(renew).toHaveBeenCalledWith(
      'sub-1',
      1,
      expect.objectContaining({
        startDate: '2026-12-05',
        endDate: '2027-02-04',
        billingCycle: 'custom',
        customCycleMonths: 2,
        supplierCostAmount: 20,
        contractReference: 'C-2',
        paymentStatus: 'sin_seguimiento',
      }),
      'a',
    );
  });
});
