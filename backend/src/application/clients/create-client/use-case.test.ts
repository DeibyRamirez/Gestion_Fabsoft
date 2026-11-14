import { describe, expect, it, vi } from 'vitest';
import type { ClientCreateInput } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import type { ClientView } from '../shared/client-view.js';
import { CreateClient } from './use-case.js';

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
  clientId: 'c1',
  requestId: 'req-2',
};

const sampleClient = (): ClientView => ({
  id: 'cl-1',
  legalName: 'Acme',
  taxId: '9001234567',
  status: 'active',
  email: null,
  phone: null,
  owner: null,
  archivedAt: null,
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
});

describe('CreateClient', () => {
  it('rechaza rol client', async () => {
    const uc = new CreateClient({ run: vi.fn() });
    await expect(
      uc.execute(clientUser, { legalName: 'X', status: 'active' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('crea cliente y audita', async () => {
    const auditWrite = vi.fn();
    const input: ClientCreateInput = {
      legalName: 'Acme',
      taxId: '900.123.456-7',
      status: 'active',
    };
    const uc = new CreateClient({
      run: async (_a, work) =>
        work({
          clientCreate: {
            findByTaxIdNormalized: async () => null,
            insert: async () => ({ ok: true, client: sampleClient() }),
          },
          audit: { write: auditWrite },
          userDetail: { findById: async () => null },
        }),
    });
    const created = await uc.execute(admin, input);
    expect(created.legalName).toBe('Acme');
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'client.created', resourceType: 'client' }),
    );
  });

  it('mapea duplicado con extensiones', async () => {
    const uc = new CreateClient({
      run: async (_a, work) =>
        work({
          clientCreate: {
            findByTaxIdNormalized: async () => null,
            insert: async () => ({
              ok: false,
              reason: 'client_tax_id_taken',
              conflict: { existingClientId: 'other', archived: true },
            }),
          },
          audit: { write: async () => undefined },
          userDetail: { findById: async () => null },
        }),
    });
    await expect(
      uc.execute(admin, { legalName: 'Dup', taxId: '900123456-7', status: 'active' }),
    ).rejects.toMatchObject({
      code: 'client_tax_id_taken',
      extensions: { existingClientId: 'other', archived: true },
    });
  });
});
