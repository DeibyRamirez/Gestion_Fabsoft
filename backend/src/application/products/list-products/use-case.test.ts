import { describe, expect, it, vi } from 'vitest';
import { ListProducts } from './use-case.js';
import type { UserActor } from '../../shared/actor.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'a',
  role: 'admin',
  clientId: null,
  requestId: 'r',
};
const client: UserActor = {
  actorType: 'user',
  userId: 'c',
  role: 'client',
  clientId: 'cl',
  requestId: 'r',
};

describe('ListProducts', () => {
  it('permite admin y operador', async () => {
    const uc = new ListProducts({
      run: async (_a, work) =>
        work({
          productsList: {
            list: async () => ({ items: [], total: 0 }),
          },
        }),
    });
    await expect(
      uc.execute({ ...admin, role: 'operator' }, { page: 1, pageSize: 20, sort: 'name' }),
    ).resolves.toMatchObject({ total: 0 });
  });

  it('rechaza client', async () => {
    const uc = new ListProducts({ run: vi.fn() });
    await expect(uc.execute(client, { page: 1, pageSize: 20, sort: 'name' })).rejects.toMatchObject(
      {
        code: 'forbidden',
      },
    );
  });
});
