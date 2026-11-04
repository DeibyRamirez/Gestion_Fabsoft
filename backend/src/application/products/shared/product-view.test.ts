import { describe, expect, it } from 'vitest';
import type { ProductView } from './product-view.js';

describe('ProductView', () => {
  it('T-HU05 — forma estable para respuestas de producto', () => {
    const view: ProductView = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Servicio',
      description: null,
      productType: 'recurring_service',
      vendor: null,
      referenceCode: null,
      status: 'active',
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
      updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    };
    expect(Object.keys(view).sort()).toEqual(
      [
        'createdAt',
        'description',
        'id',
        'name',
        'productType',
        'referenceCode',
        'status',
        'updatedAt',
        'vendor',
      ].sort(),
    );
    expect(view).not.toHaveProperty('priceAmount');
    expect(view).not.toHaveProperty('billingCycle');
  });
});
