import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { UserActor } from '../../shared/actor.js';
import { CancelSubscription } from './use-case.js';

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
  currentPeriod: null,
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
  ...over,
});

const clock = { now: () => new Date('2026-11-14T12:00:00Z') };

function makeUc(current: SubscriptionView | null, updated: SubscriptionView | null) {
  const cancel = vi.fn(async () => updated);
  const auditWrite = vi.fn(async () => undefined);
  const uc = new CancelSubscription(
    {
      run: async (_a, work) =>
        work({
          subscriptionCancel: { loadForUpdate: async () => current, cancel },
          audit: { write: auditWrite },
        }),
    },
    clock,
  );
  return { uc, cancel, auditWrite };
}

describe('CancelSubscription', () => {
  it('operator recibe forbidden', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(
      uc.execute(operator, 'sub-1', { version: 1, reason: 'motivo' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('no encontrada devuelve not_found', async () => {
    const { uc } = makeUc(null, null);
    await expect(
      uc.execute(admin, 'sub-1', { version: 1, reason: 'motivo' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('version distinta devuelve version_conflict', async () => {
    const { uc } = makeUc(sample({ version: 2 }), sample());
    await expect(
      uc.execute(admin, 'sub-1', { version: 1, reason: 'motivo' }),
    ).rejects.toMatchObject({ code: 'version_conflict' });
  });

  it('estado terminal no permite cancelar de nuevo', async () => {
    const { uc } = makeUc(sample({ status: 'cancelled' }), sample());
    await expect(
      uc.execute(admin, 'sub-1', { version: 1, reason: 'motivo' }),
    ).rejects.toMatchObject({ code: 'invalid_state_transition' });
  });

  it('cancela con fecha del reloj y audita', async () => {
    const { uc, cancel, auditWrite } = makeUc(
      sample(),
      sample({ status: 'cancelled', version: 2, cancellationReason: 'motivo' }),
    );
    const result = await uc.execute(admin, 'sub-1', { version: 1, reason: 'motivo' });
    expect(cancel).toHaveBeenCalledWith(
      'sub-1',
      1,
      'motivo',
      new Date('2026-11-14T12:00:00Z'),
      'a',
    );
    expect(result.status).toBe('cancelled');
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'subscription.cancelled' }),
    );
  });
});
