import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionPeriodView, SubscriptionView } from '../shared/subscription-view.js';
import type { UserActor } from '../../shared/actor.js';
import { ListSubscriptionPeriods } from './use-case.js';

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

const subscription = (): SubscriptionView => ({
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
  currentPeriod: null,
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
});

const period = (n: number): SubscriptionPeriodView => ({
  id: `per-${n}`,
  periodNumber: n,
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  billingCycle: 'monthly',
  priceAmount: 100,
  currency: 'COP',
  renewalOutcome: 'pendiente',
  outcomeReason: null,
  paymentStatus: 'pendiente',
  confirmedAt: null,
  confirmedBy: null,
  contractReference: null,
});

function makeUc(sub: SubscriptionView | null, periods: SubscriptionPeriodView[]) {
  const list = vi.fn(async () => periods);
  const uc = new ListSubscriptionPeriods({
    run: async (_a, work) =>
      work({
        subscriptionPeriods: { list },
        subscriptionDetail: { findById: async () => sub },
      }),
  });
  return { uc, list };
}

describe('ListSubscriptionPeriods', () => {
  it('rechaza rol client', async () => {
    const { uc } = makeUc(subscription(), [period(1)]);
    await expect(uc.execute(clientUser, 'sub-1')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('suscripción inexistente devuelve not_found', async () => {
    const { uc } = makeUc(null, []);
    await expect(uc.execute(admin, 'sub-1')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('devuelve el historial del repositorio', async () => {
    const { uc, list } = makeUc(subscription(), [period(3), period(2), period(1)]);
    const result = await uc.execute(admin, 'sub-1');
    expect(list).toHaveBeenCalledWith('sub-1');
    expect(result.map((p) => p.periodNumber)).toEqual([3, 2, 1]);
  });
});
