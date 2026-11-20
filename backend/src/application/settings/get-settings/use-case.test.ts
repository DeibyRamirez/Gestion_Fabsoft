import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { GetSettings } from './use-case.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'admin-id',
  role: 'admin',
  clientId: null,
  requestId: 'req-1',
};
const operator: UserActor = {
  actorType: 'user',
  userId: 'op-id',
  role: 'operator',
  clientId: null,
  requestId: 'req-2',
};
const client: UserActor = {
  actorType: 'user',
  userId: 'client-id',
  role: 'client',
  clientId: 'client-1',
  requestId: 'req-3',
};

describe('GetSettings', () => {
  it('permite leer a admin y operador', async () => {
    const get = vi.fn(async () => DEFAULT_SETTINGS);
    const uc = new GetSettings({
      run: async (_actor, work) => work({ settings: { get, update: get } }),
    });

    await expect(uc.execute(admin)).resolves.toEqual(DEFAULT_SETTINGS);
    await expect(uc.execute(operator)).resolves.toEqual(DEFAULT_SETTINGS);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('rechaza a un usuario de cliente', async () => {
    const uc = new GetSettings({ run: vi.fn() });
    await expect(uc.execute(client)).rejects.toMatchObject({ code: 'forbidden' });
  });
});
