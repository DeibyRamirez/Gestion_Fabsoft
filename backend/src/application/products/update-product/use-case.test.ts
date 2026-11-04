import { describe, expect, it, vi } from 'vitest';
import { UpdateProduct } from './use-case.js';
import type { UserActor } from '../../shared/actor.js';
import type { ProductView } from '../shared/product-view.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'a',
  role: 'admin',
  clientId: null,
  requestId: 'r',
};

const product = (status: 'active' | 'inactive'): ProductView => ({
  id: 'p1',
  name: 'Svc',
  description: null,
  productType: 'recurring_service',
  vendor: null,
  referenceCode: null,
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('UpdateProduct', () => {
  it('desactiva y usa acción product.deactivated', async () => {
    const auditWrite = vi.fn();
    const uc = new UpdateProduct({
      run: async (_a, work) =>
        work({
          productUpdate: {
            loadForUpdate: async () => product('active'),
            save: async () => ({ ok: true, product: product('inactive') }),
          },
          audit: { write: auditWrite },
        }),
    });
    await uc.execute(admin, 'p1', { status: 'inactive' });
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'product.deactivated' }),
    );
  });
});
