import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import type { ClientView } from '../shared/client-view.js';
import type { ClientActivityView } from '../shared/client-activity-view.js';
import { ListClientActivity } from './use-case.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'admin-id',
  role: 'admin',
  clientId: null,
  requestId: 'req-1',
};
const operator: UserActor = {
  actorType: 'user',
  userId: 'op-id',
  role: 'operator',
  clientId: null,
  requestId: 'req-2',
};
const clientUser: UserActor = {
  actorType: 'user',
  userId: 'client-user',
  role: 'client',
  clientId: 'client-1',
  requestId: 'req-3',
};

const client: ClientView = {
  id: 'client-1',
  legalName: 'Acme',
  taxId: null,
  status: 'active',
  email: null,
  phone: null,
  owner: null,
  archivedAt: null,
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
};

const activity: ClientActivityView = {
  id: '1',
  occurredAt: new Date('2026-11-14T12:00:00Z'),
  actor: { id: 'op-id', name: 'Operador' },
  action: 'subscription.updated',
  resourceType: 'subscription',
  resourceId: 'sub-1',
  summary: 'Suscripción actualizada',
};

function makeUc(client: ClientView | null) {
  const list = vi.fn(async () => ({ items: [activity], total: 1 }));
  const uc = new ListClientActivity({
    run: async (_actor, work) =>
      work({
        clientActivity: { listForClient: list },
        clientDetail: { findById: async () => client },
      }),
  });
  return { uc, list };
}

describe('ListClientActivity', () => {
  it('rechaza rol client', async () => {
    const run = vi.fn();
    const uc = new ListClientActivity({ run });
    await expect(uc.execute(clientUser, 'client-1', 1, 20)).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('devuelve not_found si el cliente no existe', async () => {
    const { uc } = makeUc(null);
    await expect(uc.execute(operator, 'client-1', 1, 20)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('operator obtiene la actividad del cliente', async () => {
    const { uc, list } = makeUc(client);
    await expect(uc.execute(operator, 'client-1', 1, 20)).resolves.toEqual({
      items: [activity],
      total: 1,
    });
    expect(list).toHaveBeenCalledWith('client-1', 1, 20);
  });

  it('admin también puede consultar', async () => {
    const { uc } = makeUc(client);
    await expect(uc.execute(admin, 'client-1', 1, 20)).resolves.toMatchObject({ total: 1 });
  });
});
