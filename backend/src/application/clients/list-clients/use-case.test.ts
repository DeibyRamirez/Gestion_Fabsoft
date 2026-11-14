import { describe, expect, it, vi } from 'vitest';
import { ListClients } from './use-case.js';
import type { UserActor } from '../../shared/actor.js';

const operator: UserActor = {
  actorType: 'user',
  userId: 'op',
  role: 'operator',
  clientId: null,
  requestId: 'r',
};

describe('ListClients', () => {
  it('rechaza client', async () => {
    const uc = new ListClients({ run: vi.fn() });
    await expect(
      uc.execute(
        { actorType: 'user', userId: 'x', role: 'client', clientId: 'c', requestId: 'r' },
        { page: 1, pageSize: 20, status: ['active'], sort: 'legalName' },
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('lista clientes', async () => {
    const uc = new ListClients({
      run: async (_a, work) =>
        work({
          clientsList: { list: async () => ({ items: [], total: 0 }) },
        }),
    });
    const r = await uc.execute(operator, {
      page: 1,
      pageSize: 10,
      status: ['active', 'inactive'],
      sort: 'legalName',
    });
    expect(r.total).toBe(0);
  });
});
