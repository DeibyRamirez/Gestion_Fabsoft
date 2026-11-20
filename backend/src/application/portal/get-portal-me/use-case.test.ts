import { describe, expect, it } from 'vitest';
import type { UserActor } from '../../shared/actor.js';
import { GetPortalMe } from './use-case.js';

const client: UserActor = {
  actorType: 'user',
  userId: 'u-1',
  role: 'client',
  clientId: 'c-1',
  requestId: 'r-1',
};

const user = {
  id: 'u-1',
  email: 'cliente@test.dev',
  fullName: 'Cliente',
  role: 'client' as const,
  clientId: 'c-1',
  status: 'activo' as const,
  mustChangePassword: false,
};

describe('GetPortalMe', () => {
  it('devuelve usuario, organización y contacto', async () => {
    const uc = new GetPortalMe({
      run: async (_actor, work) =>
        work({
          me: { findProfile: async () => user },
          portalMe: {
            findOrganization: async () => ({ id: 'c-1', legalName: 'Acme', taxId: null }),
            findContactChannel: async () => ({ email: 'a@b.dev', phone: null, hours: '8-17' }),
          },
        }),
    });
    await expect(uc.execute(client)).resolves.toMatchObject({
      user: { id: 'u-1', role: 'client' },
      organization: { legalName: 'Acme' },
      contactChannel: { email: 'a@b.dev' },
    });
  });

  it('rechaza roles internos', async () => {
    const uc = new GetPortalMe({ run: async () => Promise.reject(new Error('no debe ejecutarse')) });
    await expect(uc.execute({ ...client, role: 'admin', clientId: null })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});
