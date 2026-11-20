import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import type { SubscriptionView } from '../shared/subscription-view.js';
import { StartRenewal } from './use-case.js';

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
  currentPeriod: null,
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
  ...over,
});

function makeUc(current: SubscriptionView | null, updated: SubscriptionView | null) {
  const startRenewal = vi.fn(async () => updated);
  const auditWrite = vi.fn(async () => undefined);
  const uc = new StartRenewal({
    run: async (_a, work) =>
      work({
        subscriptionStartRenewal: { loadForUpdate: async () => current, startRenewal },
        audit: { write: auditWrite },
      }),
  });
  return { uc, startRenewal, auditWrite };
}

describe('StartRenewal', () => {
  it('rechaza rol client', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(uc.execute(clientUser, 'sub-1', 1)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('no encontrada devuelve not_found', async () => {
    const { uc } = makeUc(null, null);
    await expect(uc.execute(admin, 'sub-1', 1)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('versión vieja devuelve version_conflict', async () => {
    const { uc } = makeUc(sample({ version: 2 }), sample());
    await expect(uc.execute(admin, 'sub-1', 1)).rejects.toMatchObject({
      code: 'version_conflict',
    });
  });

  it.each(['pendiente_activacion', 'en_renovacion', 'vencida', 'cancelada', 'no_renovada'] as const)(
    'no inicia renovación desde %s',
    async (status) => {
      const { uc } = makeUc(sample({ status }), sample());
      await expect(uc.execute(admin, 'sub-1', 1)).rejects.toMatchObject({
        code: 'invalid_state_transition',
      });
    },
  );

  it('activa pasa a en_renovacion/en_gestion y audita', async () => {
    const updated = sample({ status: 'en_renovacion', followUpStatus: 'en_gestion', version: 2 });
    const { uc, startRenewal, auditWrite } = makeUc(sample(), updated);
    const result = await uc.execute(operator, 'sub-1', 1);

    expect(startRenewal).toHaveBeenCalledWith('sub-1', 1, 'o');
    expect(result).toBe(updated);
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.renewal_started',
        resourceType: 'subscription',
        resourceId: 'sub-1',
      }),
    );
  });

  it('si el repositorio no actualiza por versión devuelve version_conflict', async () => {
    const { uc } = makeUc(sample(), null);
    await expect(uc.execute(admin, 'sub-1', 1)).rejects.toMatchObject({
      code: 'version_conflict',
    });
  });
});
