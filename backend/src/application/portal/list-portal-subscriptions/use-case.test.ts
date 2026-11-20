import { describe, expect, it } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import { ListPortalSubscriptions } from './use-case.js';

const client: UserActor = {
  actorType: 'user',
  userId: 'u-1',
  role: 'client',
  clientId: 'c-1',
  requestId: 'r-1',
};

describe('ListPortalSubscriptions', () => {
  it('lista con el clientId del actor', async () => {
    const uc = new ListPortalSubscriptions({
      run: async (_actor, work) =>
        work({
          portalSubscriptions: {
            list: async (clientId, query) => {
              expect(clientId).toBe('c-1');
              expect(query.page).toBe(1);
              return { items: [], total: 0 };
            },
          },
        }),
    });
    await expect(uc.execute(client, { page: 1, pageSize: 20 })).resolves.toEqual({
      items: [],
      total: 0,
    });
  });

  it('rechaza usuarios internos', async () => {
    const uc = new ListPortalSubscriptions({ run: async () => Promise.reject(new Error('x')) });
    await expect(
      uc.execute({ ...client, role: 'operator', clientId: null }, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
