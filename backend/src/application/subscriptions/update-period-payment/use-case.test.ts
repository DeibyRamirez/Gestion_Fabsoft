import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import type { SubscriptionPeriodView } from '../shared/subscription-view.js';
import { UpdatePeriodPayment } from './use-case.js';

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

const period = (over: Partial<SubscriptionPeriodView> = {}): SubscriptionPeriodView => ({
  id: 'per-1',
  periodNumber: 1,
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
  ...over,
});

function makeUc(current: SubscriptionPeriodView | null, updated: SubscriptionPeriodView | null) {
  const updatePayment = vi.fn(async () => updated);
  const auditWrite = vi.fn(async () => undefined);
  const uc = new UpdatePeriodPayment({
    run: async (_a, work) =>
      work({
        subscriptionPeriodPayment: {
          loadPeriodForUpdate: async () => current,
          updatePayment,
        },
        audit: { write: auditWrite },
      }),
  });
  return { uc, updatePayment, auditWrite };
}

describe('UpdatePeriodPayment', () => {
  it('rechaza rol client', async () => {
    const { uc } = makeUc(period(), period());
    await expect(
      uc.execute(clientUser, 'sub-1', 'per-1', { paymentStatus: 'recibido' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('periodo ajeno o inexistente devuelve not_found', async () => {
    const { uc } = makeUc(null, null);
    await expect(
      uc.execute(admin, 'sub-1', 'per-1', { paymentStatus: 'recibido' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('actualiza pago y referencia contractual, y audita', async () => {
    const updated = period({ paymentStatus: 'recibido', contractReference: 'C-1' });
    const { uc, updatePayment, auditWrite } = makeUc(period(), updated);
    const result = await uc.execute(operator, 'sub-1', 'per-1', {
      paymentStatus: 'recibido',
      contractReference: 'C-1',
    });

    expect(updatePayment).toHaveBeenCalledWith(
      'sub-1',
      'per-1',
      { paymentStatus: 'recibido', contractReference: 'C-1' },
      'o',
    );
    expect(result).toBe(updated);
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription_period.payment_updated',
        resourceType: 'subscription_period',
        resourceId: 'per-1',
      }),
    );
  });

  it('no cambia la vigencia de la suscripción', async () => {
    const { uc, updatePayment } = makeUc(
      period({ paymentStatus: 'pendiente' }),
      period({ paymentStatus: 'recibido' }),
    );
    await uc.execute(operator, 'sub-1', 'per-1', { paymentStatus: 'recibido' });
    expect(updatePayment).toHaveBeenCalledOnce();
  });

  it('si el repositorio no devuelve el periodo devuelve not_found', async () => {
    const { uc } = makeUc(period(), null);
    await expect(
      uc.execute(admin, 'sub-1', 'per-1', { paymentStatus: 'recibido' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
