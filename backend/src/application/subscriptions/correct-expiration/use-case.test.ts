import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import { CorrectExpiration } from './use-case.js';

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

const input = { version: 1, newCurrentPeriodEnd: '2026-12-15', reason: 'Error de captura' };
const clock = { now: () => new Date('2026-11-14T12:00:00Z') };

function makeUc(current: SubscriptionView | null, updated: SubscriptionView | null) {
  const correctExpiration = vi.fn(async () => updated);
  const auditWrite = vi.fn(async () => undefined);
  const cancelPendingForPeriod = vi.fn(async () => 1);
  const scheduleForPeriod = vi.fn(async () => 1);
  const cancelPendingAutoTasksForPeriod = vi.fn(async () => 1);
  const annotateInProgressAutoTasksForPeriod = vi.fn(async () => 1);
  const uc = new CorrectExpiration(
    {
      run: async (_a, work) =>
        work({
          subscriptionCorrectExpiration: { loadForUpdate: async () => current, correctExpiration },
          alerts: {
            scheduleForPeriod,
            cancelPendingForPeriod,
            cancelPendingWithoutException: async () => 0,
            cancelAllPending: async () => 0,
            reconcile: async () => ({ scannedSubscriptions: 0, scheduled: 0, cancelled: 0 }),
          },
          tasksAutomation: {
            completeAutoTasksForSubscription: async () => 0,
            cancelPendingAutoTasksForPeriod,
            annotateInProgressAutoTasksForPeriod,
            cancelOpenAutoTasksForSubscription: async () => 0,
            cancelOpenTasksForSubscription: async () => 0,
          },
          audit: { write: auditWrite },
        }),
    },
    clock,
  );
  return {
    uc,
    correctExpiration,
    auditWrite,
    cancelPendingForPeriod,
    scheduleForPeriod,
    cancelPendingAutoTasksForPeriod,
    annotateInProgressAutoTasksForPeriod,
  };
}

describe('CorrectExpiration', () => {
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
    'no corrige desde %s',
    async (status) => {
      const { uc } = makeUc(sample({ status }), sample());
      await expect(uc.execute(admin, 'sub-1', input)).rejects.toMatchObject({
        code: 'invalid_state_transition',
      });
    },
  );

  it('rechaza una fecha anterior al inicio del periodo', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(
      uc.execute(admin, 'sub-1', { ...input, newCurrentPeriodEnd: '2026-10-31' }),
    ).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('corrige el fin del periodo y audita el valor anterior', async () => {
    const updated = sample({
      currentPeriodEnd: '2026-12-15',
      version: 2,
      currentPeriod: { ...sample().currentPeriod!, endDate: '2026-12-15' },
    });
    const {
      uc,
      correctExpiration,
      auditWrite,
      cancelPendingForPeriod,
      scheduleForPeriod,
      cancelPendingAutoTasksForPeriod,
      annotateInProgressAutoTasksForPeriod,
    } = makeUc(sample(), updated);
    const result = await uc.execute(operator, 'sub-1', input);

    expect(correctExpiration).toHaveBeenCalledWith(
      'sub-1',
      1,
      { periodId: 'per-1', newCurrentPeriodEnd: '2026-12-15' },
      'o',
    );
    expect(cancelPendingForPeriod).toHaveBeenCalledWith(
      'sub-1',
      '2026-11-30',
      'period_end_changed',
    );
    expect(scheduleForPeriod).toHaveBeenCalledWith('sub-1', '2026-11-14');
    expect(cancelPendingAutoTasksForPeriod).toHaveBeenCalledWith(
      'sub-1',
      '2026-11-30',
      'Vencimiento corregido',
      'o',
    );
    expect(annotateInProgressAutoTasksForPeriod).toHaveBeenCalledWith(
      'sub-1',
      '2026-11-30',
      'Vencimiento corregido de 2026-11-30 a 2026-12-15: Error de captura',
      'o',
    );
    expect(result).toBe(updated);
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.expiration_corrected',
        reason: input.reason,
        changes: {
          before: { end_date: '2026-11-30' },
          after: { end_date: '2026-12-15' },
        },
      }),
    );
  });

  it('si el repositorio no actualiza por versión devuelve version_conflict', async () => {
    const { uc } = makeUc(sample(), null);
    await expect(uc.execute(admin, 'sub-1', input)).rejects.toMatchObject({
      code: 'version_conflict',
    });
  });
});
