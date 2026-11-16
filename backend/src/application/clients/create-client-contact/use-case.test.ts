import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import type { ClientView } from '../shared/client-view.js';
import type { ClientContactView } from '../shared/client-contact-view.js';
import { CreateClientContact } from './use-case.js';

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

const contact = (over: Partial<ClientContactView> = {}): ClientContactView => ({
  id: 'ct-1',
  clientId: 'cl-1',
  fullName: 'Ana Pérez',
  email: 'ana@acme.test',
  phone: null,
  roleTitle: null,
  isPrimary: true,
  archivedAt: null,
  ...over,
});

describe('CreateClientContact', () => {
  it('rechaza rol client', async () => {
    const run = vi.fn();
    const uc = new CreateClientContact({ run });
    await expect(
      uc.execute(clientUser, 'cl-1', { fullName: 'X', isPrimary: false }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(run).not.toHaveBeenCalled();
  });

  it('el primer contacto queda como principal y audita', async () => {
    const insert = vi.fn(async () => contact());
    const clearPrimary = vi.fn(async () => undefined);
    const auditWrite = vi.fn(async () => undefined);
    const uc = new CreateClientContact({
      run: async (_a, work) =>
        work({
          clientContactCreate: { countActive: async () => 0, clearPrimary, insert },
          clientDetail: { findById: async () => client },
          audit: { write: auditWrite },
        }),
    });
    const created = await uc.execute(admin, 'cl-1', {
      fullName: 'Ana Pérez',
      email: 'ana@acme.test',
      isPrimary: false,
    });
    expect(clearPrimary).toHaveBeenCalledWith('cl-1');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ isPrimary: true }));
    expect(created.isPrimary).toBe(true);
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'client_contact.created', resourceType: 'client_contact' }),
    );
  });

  it('un segundo contacto no principal no desmarca al actual', async () => {
    const insert = vi.fn(async () => contact({ id: 'ct-2', isPrimary: false }));
    const clearPrimary = vi.fn(async () => undefined);
    const uc = new CreateClientContact({
      run: async (_a, work) =>
        work({
          clientContactCreate: { countActive: async () => 1, clearPrimary, insert },
          clientDetail: { findById: async () => client },
          audit: { write: async () => undefined },
        }),
    });
    await uc.execute(admin, 'cl-1', { fullName: 'Luis', phone: '3001234567', isPrimary: false });
    expect(clearPrimary).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ isPrimary: false }));
  });

  it('rechaza contacto sin email ni teléfono', async () => {
    const run = vi.fn();
    const uc = new CreateClientContact({ run });
    await expect(
      uc.execute(admin, 'cl-1', { fullName: 'Sin datos', isPrimary: false }),
    ).rejects.toMatchObject({ code: 'validation_error' });
    expect(run).not.toHaveBeenCalled();
  });

  it('cliente inexistente devuelve not_found', async () => {
    const uc = new CreateClientContact({
      run: async (_a, work) =>
        work({
          clientContactCreate: {
            countActive: async () => 0,
            clearPrimary: async () => undefined,
            insert: async () => contact(),
          },
          clientDetail: { findById: async () => null },
          audit: { write: async () => undefined },
        }),
    });
    await expect(
      uc.execute(admin, 'missing', { fullName: 'Ana', email: 'a@b.co', isPrimary: false }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
