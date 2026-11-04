import { describe, expect, it } from 'vitest';
import { ActivateProduct } from './use-case.js';
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

describe('ActivateProduct', () => {
  it('es idempotente si ya está activo', async () => {
    const uc = new ActivateProduct({
      run: async (_a, work) =>
        work({
          productUpdate: {
            loadForUpdate: async () => p('active'),
            save: async () => {
              throw new Error('no debería guardar');
            },
          },
          audit: { write: async () => undefined },
        }),
    });
    const result = await uc.execute(admin, 'p1');
    expect(result.status).toBe('active');
  });
});
