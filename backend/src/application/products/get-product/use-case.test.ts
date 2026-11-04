import { describe, expect, it, vi } from 'vitest';
import { GetProduct } from './use-case.js';
import type { UserActor } from '../../shared/actor.js';
import type { ProductView } from '../shared/product-view.js';

const admin: UserActor = {
  actorType: 'user',
  userId: 'a',
  role: 'admin',
  clientId: null,
  requestId: 'r',
};

const sample: ProductView = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Producto demo',
  description: 'Detalle',
  productType: 'third_party',
  vendor: 'Vendor',
  referenceCode: 'REF-1',
  status: 'active',
  createdAt: new Date('2026-11-01T12:00:00.000Z'),
  updatedAt: new Date('2026-11-01T12:00:00.000Z'),
};

describe('GetProduct', () => {
  it('T-HU05 — devuelve ProductView completo para admin', async () => {
    const uc = new GetProduct({
      run: async (_a, work) => work({ productDetail: { findById: async () => sample } }),
    });
    await expect(uc.execute(admin, sample.id)).resolves.toEqual(sample);
  });

  it('T-HU05 — not_found si no existe', async () => {
    const uc = new GetProduct({
      run: async (_a, work) => work({ productDetail: { findById: async () => null } }),
    });
    await expect(uc.execute(admin, sample.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('T-HU05 — operador permitido; client forbidden', async () => {
    const ok = new GetProduct({
      run: async (_a, work) => work({ productDetail: { findById: async () => sample } }),
    });
    await expect(ok.execute({ ...admin, role: 'operator' }, sample.id)).resolves.toEqual(sample);

    const denied = new GetProduct({ run: vi.fn() });
    await expect(
      denied.execute({ ...admin, role: 'client', clientId: 'cl', userId: 'u' }, sample.id),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
