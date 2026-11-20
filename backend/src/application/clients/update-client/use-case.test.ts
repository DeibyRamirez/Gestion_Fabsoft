import { describe, expect, it } from 'vitest';
import { UpdateClient } from './use-case.js';
import type { UserActor } from '../../shared/actor.js';
import type { ClientView } from '../shared/client-view.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'a',
  role: 'admin',
  clientId: null,
  requestId: 'r',
};

const client = (): ClientView => ({
  id: 'c1',
  legalName: 'X',
  taxId: null,
  status: 'activo',
  email: null,
  phone: null,
  owner: null,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('UpdateClient', () => {
  it('rechaza edición de archivado', async () => {
    const uc = new UpdateClient({
      run: async (_a, work) =>
        work({
          clientUpdate: {
            loadForUpdate: async () => ({ ...client(), status: 'archivado' }),
            findByTaxIdNormalized: async () => null,
            save: async () => ({ ok: true, client: client() }),
          },
          audit: { write: async () => undefined },
          userDetail: { findById: async () => null },
        }),
    });
    await expect(uc.execute(admin, 'c1', { legalName: 'Y' })).rejects.toMatchObject({
      code: 'client_archived',
    });
  });
});
