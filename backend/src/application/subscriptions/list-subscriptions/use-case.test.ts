import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionListQuery } from '@fabsoft/shared';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { UserActor } from '../../shared/actor.js';
import { ListSubscriptions } from './use-case.js';

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

const sample = (): SubscriptionView => ({
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
  status: 'pending_activation',
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
});

const query: SubscriptionListQuery = { page: 1, pageSize: 20, sort: 'currentPeriodEnd' };

describe('ListSubscriptions', () => {
  it('rechaza rol client', async () => {
    const run = vi.fn();
    const uc = new ListSubscriptions({ run });
    await expect(uc.execute(clientUser, query)).rejects.toMatchObject({ code: 'forbidden' });
    expect(run).not.toHaveBeenCalled();
  });

  it('lista con el query recibido', async () => {
    const list = vi.fn(async () => ({ items: [sample()], total: 1 }));
    const uc = new ListSubscriptions({
      run: async (_a, work) => work({ subscriptionsList: { list } }),
    });
    const result = await uc.execute(admin, query);
    expect(list).toHaveBeenCalledWith(query);
    expect(result.total).toBe(1);
  });
});
