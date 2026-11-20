import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import type { RenewalRequestView } from '../list-renewal-requests/ports.js';
import { ResolveRenewalRequest } from './use-case.js';

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
const client: UserActor = {
  actorType: 'user',
  userId: 'c',
  role: 'client',
  clientId: 'cl-1',
  requestId: 'r',
};

const sample = (over: Partial<RenewalRequestView> = {}): RenewalRequestView => ({
  id: 'rr-1',
  subscriptionId: 'sub-1',
  clientId: 'cl-1',
  requestedBy: { actorType: 'user', id: 'u-1', name: 'Cliente' },
  comment: 'Quiero renovar',
  status: 'pendiente_revision',
  assignedUser: null,
  resolution: null,
  resolutionNote: null,
  resolvedAt: null,
  createdAt: new Date('2026-11-20T12:00:00Z'),
  updatedAt: new Date('2026-11-20T12:00:00Z'),
  ...over,
});

const clock = { now: () => new Date('2026-11-21T12:00:00Z') };

function makeUc(
  current: RenewalRequestView | null,
  updated: RenewalRequestView | null,
  confirmedRenewal = false,
) {
  const resolve = vi.fn(async () => updated);
  const hasConfirmedRenewalAfter = vi.fn(async () => confirmedRenewal);
  const auditWrite = vi.fn(async () => undefined);
  const uc = new ResolveRenewalRequest(
    {
      run: async (_actor, work) =>
        work({
          renewalRequestResolve: {
            loadForUpdate: async () => current,
            hasConfirmedRenewalAfter,
            resolve,
          },
          audit: { write: auditWrite },
        }),
    },
    clock,
  );
  return { uc, resolve, hasConfirmedRenewalAfter, auditWrite };
}

describe('ResolveRenewalRequest', () => {
  it('rechaza rol client', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(uc.execute(client, 'rr-1', { resolution: 'otra' })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('no encontrada devuelve not_found', async () => {
    const { uc } = makeUc(null, null);
    await expect(uc.execute(admin, 'rr-1', { resolution: 'otra' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('no resuelve dos veces', async () => {
    const { uc } = makeUc(sample({ status: 'resuelta' }), sample());
    await expect(uc.execute(admin, 'rr-1', { resolution: 'otra' })).rejects.toMatchObject({
      code: 'invalid_state_transition',
    });
  });

  it('renovada exige una renovación confirmada posterior', async () => {
    const { uc } = makeUc(sample(), sample(), false);
    await expect(uc.execute(operator, 'rr-1', { resolution: 'renovada' })).rejects.toMatchObject({
      code: 'renewal_not_confirmed',
    });
  });

  it('resuelve renovada con periodo confirmado y audita', async () => {
    const updated = sample({
      status: 'resuelta',
      resolution: 'renovada',
      resolutionNote: 'Confirmada',
      resolvedAt: new Date('2026-11-21T12:00:00Z'),
    });
    const { uc, resolve, hasConfirmedRenewalAfter, auditWrite } = makeUc(sample(), updated, true);

    await expect(
      uc.execute(operator, 'rr-1', { resolution: 'renovada', resolutionNote: 'Confirmada' }),
    ).resolves.toBe(updated);

    expect(hasConfirmedRenewalAfter).toHaveBeenCalledWith(
      'sub-1',
      new Date('2026-11-20T12:00:00Z'),
    );
    expect(resolve).toHaveBeenCalledWith('rr-1', {
      resolution: 'renovada',
      resolutionNote: 'Confirmada',
      resolvedAt: new Date('2026-11-21T12:00:00Z'),
      resolvedBy: 'o',
    });
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'renewal_request.resolved' }),
    );
  });
});
