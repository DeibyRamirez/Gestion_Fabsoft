import { describe, expect, it } from 'vitest';
import { GetClient } from './use-case.js';
import type { UserActor } from '../../shared/actor.js';

const op: UserActor = {
  actorType: 'user',
  userId: 'o',
  role: 'operator',
  clientId: null,
  requestId: 'r',
};

describe('GetClient', () => {
  it('not_found si no existe', async () => {
    const uc = new GetClient({
      run: async (_a, work) => work({ clientDetail: { findById: async () => null } }),
    });
    await expect(uc.execute(op, 'missing')).rejects.toMatchObject({ code: 'not_found' });
  });
});
