import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import type { RenewalRequestView } from '../list-renewal-requests/ports.js';
import { UpdateRenewalRequest } from './use-case.js';

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

function makeUc(current: RenewalRequestView | null, updated: RenewalRequestView | null) {
  const update = vi.fn(async () => updated);
  const findAssignableUser = vi.fn(async (): Promise<{ id: string; fullName: string } | null> => ({
    id: 'o',
    fullName: 'Operador',
  }));
  const auditWrite = vi.fn(async () => undefined);
  const uc = new UpdateRenewalRequest({
    run: async (_actor, work) =>
      work({
        renewalRequestUpdate: {
          loadForUpdate: async () => current,
          findAssignableUser,
          update,
        },
        audit: { write: auditWrite },
      }),
  });
  return { uc, update, findAssignableUser, auditWrite };
}

describe('UpdateRenewalRequest', () => {
  it('rechaza rol client', async () => {
    const { uc } = makeUc(sample(), sample());
    await expect(uc.execute(client, 'rr-1', { status: 'en_progreso' })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('no encontrada devuelve not_found', async () => {
    const { uc } = makeUc(null, null);
    await expect(uc.execute(admin, 'rr-1', { status: 'en_progreso' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('una solicitud resuelta no se modifica', async () => {
    const { uc } = makeUc(sample({ status: 'resuelta' }), sample());
    await expect(uc.execute(admin, 'rr-1', { status: 'en_progreso' })).rejects.toMatchObject({
      code: 'invalid_state_transition',
    });
  });

  it('valida que el responsable sea staff activo', async () => {
    const { uc, findAssignableUser } = makeUc(sample(), sample());
    findAssignableUser.mockResolvedValueOnce(null);
    await expect(
      uc.execute(admin, 'rr-1', { assignedUserId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('asignar responsable pasa la solicitud a en progreso', async () => {
    const updated = sample({
      status: 'en_progreso',
      assignedUser: { id: 'o', fullName: 'Operador' },
    });
    const { uc, update, auditWrite } = makeUc(sample(), updated);

    await expect(uc.execute(operator, 'rr-1', { assignedUserId: 'o' })).resolves.toBe(updated);

    expect(update).toHaveBeenCalledWith('rr-1', {
      status: 'en_progreso',
      assignedUserId: 'o',
    });
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'renewal_request.updated' }),
    );
  });
});
