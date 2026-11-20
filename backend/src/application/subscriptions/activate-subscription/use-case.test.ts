import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { UserActor } from '../../shared/actor.js';
import { ActivateSubscription } from './use-case.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'a',
  role: 'admin',
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
  status: 'pendiente_activacion',
  followUpStatus: 'sin_gestion',
  visibleInPortal: true,
  ownerUserId: null,
  owner: null,
  notes: null,
  cancelledAt: null,
  cancellationReason: null,
  version: 1,
  currentPeriod: null,
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
  ...over,
});

const clock = { now: () => new Date('2026-11-14T12:00:00Z') };

function makeUc(current: SubscriptionView | null, updated: SubscriptionView | null) {
  const activate = vi.fn(async () => updated);
  const auditWrite = vi.fn(async () => undefined);
  const scheduleForPeriod = vi.fn(async () => 1);
  const uc = new ActivateSubscription(
    {
      run: async (_a, work) =>
        work({
          subscriptionActivate: { loadForUpdate: async () => current, activate },
          alerts: {
            scheduleForPeriod,
            cancelPendingForPeriod: async () => 0,
            cancelPendingWithoutException: async () => 0,
            cancelAllPending: async () => 0,
            reconcile: async () => ({ scannedSubscriptions: 0, scheduled: 0, cancelled: 0 }),
          },
          audit: { write: auditWrite },
        }),
    },
    clock,
  );
  return { uc, activate, auditWrite, scheduleForPeriod };
}

describe('ActivateSubscription', () => {
  it('rechaza rol client', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(uc.execute(clientUser, 'sub-1', 1)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('no encontrada devuelve not_found', async () => {
    const { uc } = makeUc(null, null);
    await expect(uc.execute(admin, 'sub-1', 1)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('version distinta devuelve version_conflict', async () => {
    const { uc } = makeUc(sample({ version: 2 }), sample());
    await expect(uc.execute(admin, 'sub-1', 1)).rejects.toMatchObject({ code: 'version_conflict' });
  });

  it('transición inválida devuelve invalid_state_transition', async () => {
    const { uc } = makeUc(sample({ status: 'activa' }), sample());
    await expect(uc.execute(admin, 'sub-1', 1)).rejects.toMatchObject({
      code: 'invalid_state_transition',
    });
  });

  it('activa y audita', async () => {
    const { uc, activate, auditWrite, scheduleForPeriod } = makeUc(
      sample(),
      sample({ status: 'activa', version: 2 }),
    );
    const result = await uc.execute(admin, 'sub-1', 1);
    expect(activate).toHaveBeenCalledWith('sub-1', 1, 'a');
    expect(scheduleForPeriod).toHaveBeenCalledWith('sub-1', '2026-11-14');
    expect(result.status).toBe('activa');
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'subscription.activated' }),
    );
  });
});
