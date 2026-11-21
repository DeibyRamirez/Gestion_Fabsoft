import { describe, expect, it, vi } from 'vitest';
import type { Settings } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { UpdateSettings } from './use-case.js';

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

const before: Settings = {
  contactChannel: { email: 'contacto@fabsoft.test', phone: '3000000000', hours: 'L-V 8:00-17:00' },
};
const after: Settings = {
  contactChannel: { email: 'soporte@fabsoft.test', phone: null, hours: null },
};

describe('UpdateSettings', () => {
  it('rechaza al operador', async () => {
    const uc = new UpdateSettings({ run: vi.fn() });
    await expect(uc.execute(operator, after)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('actualiza y audita before/after del canal de contacto', async () => {
    const update = vi.fn(async () => after);
    const write = vi.fn(async () => undefined);
    const uc = new UpdateSettings({
      run: async (_actor, work) =>
        work({
          settings: { get: async () => before, update },
          audit: { write },
        }),
    });

    await expect(uc.execute(admin, after)).resolves.toEqual(after);
    expect(update).toHaveBeenCalledWith(after, admin.userId);
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'app_setting.updated',
        resourceType: 'app_setting',
        resourceId: 'contact_channel',
        changes: {
          before: { value: before.contactChannel },
          after: { value: after.contactChannel },
        },
      }),
    );
  });
});
