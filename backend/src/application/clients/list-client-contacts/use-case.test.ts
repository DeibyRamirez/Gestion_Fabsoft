import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import type { ClientView } from '../shared/client-view.js';
import type { ClientContactView } from '../shared/client-contact-view.js';
import { ListClientContacts } from './use-case.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'admin-id',
  role: 'admin',
  clientId: null,
  requestId: 'req-1',
};
const clientUser: UserActor = {
  actorType: 'user',
  userId: 'cu',
  role: 'client',
  clientId: 'cl-1',
  requestId: 'req-2',
};

const client: ClientView = {
  id: 'cl-1',
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

const contact: ClientContactView = {
  id: 'ct-1',
  clientId: 'cl-1',
  fullName: 'Ana Pérez',
  email: 'ana@acme.test',
  phone: null,
  roleTitle: null,
  isPrimary: true,
  archivedAt: null,
};

describe('ListClientContacts', () => {
  it('rechaza rol client', async () => {
    const run = vi.fn();
    const uc = new ListClientContacts({ run });
    await expect(uc.execute(clientUser, 'cl-1', false)).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('cliente inexistente devuelve not_found', async () => {
    const uc = new ListClientContacts({
      run: async (_a, work) =>
        work({
          clientContactsList: { list: async () => [] },
          clientDetail: { findById: async () => null },
        }),
    });
    await expect(uc.execute(admin, 'missing', false)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lista los contactos con includeArchived', async () => {
    const list = vi.fn(async () => [contact]);
    const uc = new ListClientContacts({
      run: async (_a, work) =>
        work({
          clientContactsList: { list },
          clientDetail: { findById: async () => client },
        }),
    });
    const result = await uc.execute(admin, 'cl-1', true);
    expect(list).toHaveBeenCalledWith('cl-1', true);
    expect(result).toEqual([contact]);
  });
});
