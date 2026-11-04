import { describe, expect, it, vi } from 'vitest';
import type { ProductCreateInput } from '@fabsoft/shared';
import { CreateProduct } from './use-case.js';
import type { ProductView } from '../shared/product-view.js';
import type { UserActor } from '../../shared/actor.js';

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

const sampleProduct = (): ProductView => ({
  id: 'p1',
  name: 'Antivirus',
  description: null,
  productType: 'third_party',
  vendor: 'Acme',
  referenceCode: null,
  status: 'active',
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
});

describe('CreateProduct', () => {
  it('rechaza operador', async () => {
    const uc = new CreateProduct({ run: vi.fn() });
    await expect(uc.execute(operator, { name: 'X', productType: 'own' })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('crea producto y audita', async () => {
    const auditWrite = vi.fn();
    const input: ProductCreateInput = {
      name: 'Antivirus',
      productType: 'third_party',
      vendor: 'Acme',
    };
    const uc = new CreateProduct({
      run: async (_a, work) =>
        work({
          productCreate: {
            insert: async () => ({ ok: true, product: sampleProduct() }),
          },
          audit: { write: auditWrite },
        }),
    });
    const created = await uc.execute(admin, input);
    expect(created.name).toBe('Antivirus');
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'product.created', resourceType: 'product' }),
    );
  });

  it('mapea duplicado a duplicate_product', async () => {
    const uc = new CreateProduct({
      run: async (_a, work) =>
        work({
          productCreate: { insert: async () => ({ ok: false, reason: 'duplicate_product' }) },
          audit: { write: async () => undefined },
        }),
    });
    await expect(uc.execute(admin, { name: 'Dup', productType: 'own' })).rejects.toMatchObject({
      code: 'duplicate_product',
    });
  });
});
