import { describe, expect, it } from 'vitest';
import { ReactivateClient } from './use-case.js';
import type { UserActor } from '../../shared/actor.js';
import type { ClientView } from '../shared/client-view.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'a',
  role: 'admin',
  clientId: null,
  requestId: 'r',
};

describe('ReactivateClient', () => {
  it('invalid_state_transition si ya activo', async () => {
    const active: ClientView = {
      id: 'c1',
      legalName: 'X',
      taxId: null,
      status: 'active',
      email: null,
      phone: null,
      owner: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const uc = new ReactivateClient({
      run: async (_a, work) =>
        work({
          clientReactivate: {
            loadForUpdate: async () => active,
            reactivate: async () => active,
          },
          audit: { write: async () => undefined },
        }),
    });
    await expect(uc.execute(admin, 'c1')).rejects.toMatchObject({
      code: 'invalid_state_transition',
    });
  });
});