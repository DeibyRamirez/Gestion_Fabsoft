import { describe, expect, it } from 'vitest';
import { ArchiveClient } from './use-case.js';
import type { UserActor } from '../../shared/actor.js';
import type { ClientView } from '../shared/client-view.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'a',
  role: 'admin',
  clientId: null,
  requestId: 'r',
};

const row = (): ClientView => ({
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

describe('ArchiveClient', () => {
  it('invalid_state_transition si ya archivado', async () => {
    const uc = new ArchiveClient({
      run: async (_a, work) =>
        work({
          clientArchive: {
            loadForUpdate: async () => ({ ...row(), status: 'archivado', archivedAt: new Date() }),
            archive: async () => row(),
          },
          audit: { write: async () => undefined },
        }),
    });
    await expect(uc.execute(admin, 'c1', { reason: 'motivo' })).rejects.toMatchObject({
      code: 'invalid_state_transition',
    });
  });
});
