import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import { MarkNotRenewed } from './use-case.js';

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
  status: 'active',
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
    priceAmount: 100,
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

const input = { version: 1, reason: 'El cliente no continuará' };
const clock = { now: () => new Date('2026-11-14T12:00:00Z') };

function makeUc(current: SubscriptionView | null, updated: SubscriptionView | null) {
  const markNotRenewed = vi.fn(async () => updated);
  const auditWrite = vi.fn(async () => undefined);
  const cancelPendingWithoutException = vi.fn(async () => 1);
  const cancelOpenAutoTasksForSubscription = vi.fn(async () => 1);
  const uc = new MarkNotRenewed(
    {
      run: async (_a, work) =>
        work({
          subscriptionMarkNotRenewed: { loadForUpdate: async () => current, markNotRenewed },
          alerts: {
            scheduleForPeriod: async () => 0,
            cancelPendingForPeriod: async () => 0,
            cancelPendingWithoutException,
            cancelAllPending: async () => 0,
            reconcile: async () => ({ scannedSubscriptions: 0, scheduled: 0, cancelled: 0 }),
          },
          tasksAutomation: {
            completeAutoTasksForSubscription: async () => 0,
            cancelPendingAutoTasksForPeriod: async () => 0,
            annotateInProgressAutoTasksForPeriod: async () => 0,
            cancelOpenAutoTasksForSubscription,
            cancelOpenTasksForSubscription: async () => 0,
          },
          audit: { write: auditWrite },
        }),
    },
    clock,
  );
  return {
    uc,
    markNotRenewed,
    auditWrite,
    cancelPendingWithoutException,
    cancelOpenAutoTasksForSubscription,
  };
}

describe('MarkNotRenewed', () => {
  it('rechaza rol client', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(uc.execute(clientUser, 'sub-1', input)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('no encontrada devuelve not_found', async () => {
    const { uc } = makeUc(null, null);
    await expect(uc.execute(admin, 'sub-1', input)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('versión vieja devuelve version_conflict', async () => {
    const { uc } = makeUc(sample({ version: 2 }), sample());
    await expect(uc.execute(admin, 'sub-1', input)).rejects.toMatchObject({
      code: 'version_conflict',
    });
  });

  it.each(['pending_activation', 'cancelled', 'not_renewed'] as const)(
    'no registra no renovación desde %s',
    async (status) => {
      const { uc } = makeUc(sample({ status }), sample());
      await expect(uc.execute(admin, 'sub-1', input)).rejects.toMatchObject({
        code: 'invalid_state_transition',
      });
    },
  );

  it('sin periodo vigente devuelve invalid_state_transition', async () => {
    const { uc } = makeUc(sample({ currentPeriod: null }), sample());
    await expect(uc.execute(admin, 'sub-1', input)).rejects.toMatchObject({
      code: 'invalid_state_transition',
    });
  });

  it('active difiere el estado y registra el outcome en el periodo', async () => {
    const updated = sample({
      followUpStatus: 'closed',
      version: 2,
      currentPeriod: {
        ...sample().currentPeriod!,
        renewalOutcome: 'not_renewed',
        outcomeReason: input.reason,
        confirmedAt: new Date('2026-11-14T12:00:00Z'),
        confirmedBy: { id: 'o', fullName: 'Operador' },
      },
    });
    const {
      uc,
      markNotRenewed,
      auditWrite,
      cancelPendingWithoutException,
      cancelOpenAutoTasksForSubscription,
    } = makeUc(sample(), updated);
    const result = await uc.execute(operator, 'sub-1', input);

    expect(markNotRenewed).toHaveBeenCalledWith(
      'sub-1',
      1,
      {
        periodId: 'per-1',
        reason: input.reason,
        immediateStatus: null,
        confirmedAt: new Date('2026-11-14T12:00:00Z'),
      },
      'o',
    );
    expect(cancelPendingWithoutException).toHaveBeenCalledWith('sub-1', 'not_renewed');
    expect(cancelOpenAutoTasksForSubscription).toHaveBeenCalledWith(
      'sub-1',
      `No renovación: ${input.reason}`,
      'o',
    );
    expect(result).toBe(updated);
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.not_renewed',
        reason: input.reason,
      }),
    );
  });

  it('expired pasa a not_renewed de inmediato', async () => {
    const { uc, markNotRenewed } = makeUc(sample({ status: 'expired' }), sample());
    await uc.execute(admin, 'sub-1', input);
    expect(markNotRenewed).toHaveBeenCalledWith(
      'sub-1',
      1,
      expect.objectContaining({ immediateStatus: 'not_renewed' }),
      'a',
    );
  });

  it('no repite la decisión ya registrada mientras sigue vigente', async () => {
    const current = sample({
      currentPeriod: { ...sample().currentPeriod!, renewalOutcome: 'not_renewed' },
    });
    const { uc } = makeUc(current, sample());
    await expect(uc.execute(admin, 'sub-1', input)).rejects.toMatchObject({
      code: 'invalid_state_transition',
    });
  });

  it('si el repositorio no actualiza por versión devuelve version_conflict', async () => {
    const { uc } = makeUc(sample(), null);
    await expect(uc.execute(admin, 'sub-1', input)).rejects.toMatchObject({
      code: 'version_conflict',
    });
  });
});
