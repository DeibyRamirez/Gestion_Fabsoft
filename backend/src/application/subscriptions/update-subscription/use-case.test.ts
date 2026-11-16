import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionView } from '../shared/subscription-view.js';
import type { UserActor } from '../../shared/actor.js';
import { UpdateSubscription } from './use-case.js';

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
  currentPeriod: null,
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
  ...over,
});

function makeUc(current: SubscriptionView | null, updated: SubscriptionView | null) {
  const save = vi.fn(async () => updated);
  const auditWrite = vi.fn(async () => undefined);
  const uc = new UpdateSubscription({
    run: async (_a, work) =>
      work({
        subscriptionUpdate: { loadForUpdate: async () => current, save },
        audit: { write: auditWrite },
      }),
  });
  return { uc, save, auditWrite };
}

describe('UpdateSubscription', () => {
  it('rechaza rol client', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(uc.execute(clientUser, 'sub-1', { version: 1, notes: 'x' })).rejects.toMatchObject(
      {
        code: 'forbidden',
      },
    );
  });

  it('operador no puede cambiar precio', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(
      uc.execute(operator, 'sub-1', { version: 1, priceAmount: 200 }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('admin exige changeReason al cambiar precio', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(
      uc.execute(admin, 'sub-1', { version: 1, priceAmount: 200 }),
    ).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('no encontrada devuelve not_found', async () => {
    const { uc } = makeUc(null, null);
    await expect(uc.execute(admin, 'sub-1', { version: 1, notes: 'x' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('version distinta devuelve version_conflict', async () => {
    const { uc } = makeUc(sample({ version: 2 }), sample());
    await expect(uc.execute(admin, 'sub-1', { version: 1, notes: 'x' })).rejects.toMatchObject({
      code: 'version_conflict',
    });
  });

  it('actualiza campos no sensibles y audita updated', async () => {
    const { uc, save, auditWrite } = makeUc(sample(), sample({ notes: 'nuevo', version: 2 }));
    await uc.execute(admin, 'sub-1', { version: 1, notes: 'nuevo' });
    expect(save).toHaveBeenCalledWith('sub-1', 1, { notes: 'nuevo' }, 'a');
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'subscription.updated' }),
    );
  });

  it('admin cambia precio con motivo y audita price_changed', async () => {
    const { uc, save, auditWrite } = makeUc(sample(), sample({ priceAmount: 200, version: 2 }));
    await uc.execute(admin, 'sub-1', { version: 1, priceAmount: 200, changeReason: 'ajuste' });
    expect(save).toHaveBeenCalledWith('sub-1', 1, { priceAmount: 200 }, 'a');
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'subscription.price_changed' }),
    );
  });

  it('admin actualiza todos los campos opcionales', async () => {
    const { uc, save } = makeUc(sample(), sample({ version: 2 }));
    await uc.execute(admin, 'sub-1', {
      version: 1,
      contractReference: 'C-1',
      renewalTerms: 'Renovación',
      isRenewable: false,
      visibleInPortal: false,
      ownerUserId: 'owner-1',
      notes: 'nota',
      followUpStatus: 'awaiting_client',
      priceAmount: 200,
      supplierCostAmount: 50,
      changeReason: 'ajuste de precio',
    });
    expect(save).toHaveBeenCalledWith(
      'sub-1',
      1,
      expect.objectContaining({
        contractReference: 'C-1',
        renewalTerms: 'Renovación',
        isRenewable: false,
        visibleInPortal: false,
        ownerUserId: 'owner-1',
        notes: 'nota',
        followUpStatus: 'awaiting_client',
        priceAmount: 200,
        supplierCostAmount: 50,
      }),
      'a',
    );
  });
});
