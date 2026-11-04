import { describe, expect, it } from 'vitest';
import { DeactivateProduct } from '../deactivate-product/use-case.js';
import type { UserActor } from '../../shared/actor.js';
import type { ProductView } from '../shared/product-view.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'a',
  role: 'admin',
  clientId: null,
  requestId: 'r',
};

const p = (status: 'active' | 'inactive'): ProductView => ({
  id: 'p1',
  name: 'X',
  description: null,
  productType: 'own',
  vendor: null,
  referenceCode: null,
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('DeactivateProduct', () => {
  it('desactiva producto activo', async () => {
    const uc = new DeactivateProduct({
      run: async (_a, work) =>
        work({
          productUpdate: {
            loadForUpdate: async () => p('active'),
            save: async () => ({ ok: true, product: p('inactive') }),
          },
          audit: { write: async () => undefined },
        }),
    });
    expect((await uc.execute(admin, 'p1')).status).toBe('inactive');
  });
});
