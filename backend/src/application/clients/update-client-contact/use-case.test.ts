import { describe, expect, it, vi } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import type { ClientView } from '../shared/client-view.js';
import type { ClientContactView } from '../shared/client-contact-view.js';
import { UpdateClientContact } from './use-case.js';

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
  status: 'activo',
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

function makeUc(
  current: ClientContactView | null,
  opts: {
    otherActive?: number;
    otherPrimary?: number;
    saved?: ClientContactView;
  } = {},
) {
  const clearPrimary = vi.fn(async () => undefined);
  const save = vi.fn(async () => opts.saved ?? { ...(current ?? contact()), ...{} });
  const auditWrite = vi.fn(async () => undefined);
  const uc = new UpdateClientContact({
    run: async (_a, work) =>
      work({
        clientContactUpdate: {
          loadForUpdate: async () => current,
          countOtherActive: async () => opts.otherActive ?? 0,
          countOtherPrimary: async () => opts.otherPrimary ?? 0,
          clearPrimary,
          save,
        },
        clientDetail: { findById: async () => client },
        audit: { write: auditWrite },
      }),
  });
  return { uc, clearPrimary, save, auditWrite };
}

describe('UpdateClientContact', () => {
  it('rechaza rol client', async () => {
    const { uc } = makeUc(contact());
    await expect(uc.execute(clientUser, 'cl-1', 'ct-1', { fullName: 'X' })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('contacto inexistente devuelve not_found', async () => {
    const { uc } = makeUc(null);
    await expect(uc.execute(admin, 'cl-1', 'ct-1', { fullName: 'X' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('archivar el principal con otros contactos devuelve 409', async () => {
    const { uc, save } = makeUc(contact({ isPrimary: true }), { otherActive: 1 });
    await expect(uc.execute(admin, 'cl-1', 'ct-1', { archived: true })).rejects.toMatchObject({
      code: 'primary_contact_conflict',
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('archivar el principal sin otros contactos lo permite', async () => {
    const archived = contact({ isPrimary: true, archivedAt: new Date('2026-11-14T10:00:00Z') });
    const { uc, save, auditWrite } = makeUc(contact({ isPrimary: true }), {
      otherActive: 0,
      saved: archived,
    });
    const result = await uc.execute(admin, 'cl-1', 'ct-1', { archived: true });
    expect(save).toHaveBeenCalledWith(
      'ct-1',
      expect.objectContaining({ archivedAt: expect.any(Date) }),
    );
    expect(result.archivedAt).not.toBeNull();
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'client_contact.archived' }),
    );
  });

  it('marcar otro contacto como principal desmarca el anterior', async () => {
    const currentContact = contact({ id: 'ct-2', isPrimary: false });
    const saved = contact({ id: 'ct-2', isPrimary: true });
    const { uc, clearPrimary, save } = makeUc(currentContact, { saved, otherPrimary: 1 });
    await uc.execute(admin, 'cl-1', 'ct-2', { isPrimary: true });
    expect(clearPrimary).toHaveBeenCalledWith('cl-1');
    expect(save).toHaveBeenCalledWith('ct-2', expect.objectContaining({ isPrimary: true }));
  });

  it('no permite desmarcar el único principal', async () => {
    const { uc } = makeUc(contact({ isPrimary: true }), { otherPrimary: 0 });
    await expect(uc.execute(admin, 'cl-1', 'ct-1', { isPrimary: false })).rejects.toMatchObject({
      code: 'primary_contact_conflict',
    });
  });

  it('rechaza dejar el contacto sin email ni teléfono', async () => {
    const { uc, save } = makeUc(contact({ email: 'ana@acme.test', phone: null, isPrimary: false }));
    await expect(uc.execute(admin, 'cl-1', 'ct-1', { email: null })).rejects.toMatchObject({
      code: 'validation_error',
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('al reactivar con otro principal queda como no principal', async () => {
    const archived = contact({ isPrimary: false, archivedAt: new Date('2026-11-01T10:00:00Z') });
    const saved = contact({ isPrimary: false, archivedAt: null });
    const { uc, save } = makeUc(archived, { saved, otherPrimary: 1 });
    await uc.execute(admin, 'cl-1', 'ct-1', { archived: false });
    expect(save).toHaveBeenCalledWith('ct-1', expect.objectContaining({ archivedAt: null }));
  });
});
