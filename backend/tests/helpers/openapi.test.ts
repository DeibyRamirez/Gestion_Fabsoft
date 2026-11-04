import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  assertInvalidComponentSchema,
  assertValidComponentSchema,
  expectRequestMatchesOperation,
  findOperation,
  loadOpenApiSpec,
  openApiSpecPath,
} from '../helpers/openapi.js';

describe('OpenAPI helper — productos (AJV)', () => {
  it('T-HU05-08 — POST /api/v1/products define createProduct sin price ni billingCycle', () => {
    const op = findOperation('createProduct');
    expect(op).not.toBeNull();
    expect(op!.path).toBe('/api/v1/products');
    expect(op!.method).toBe('post');

    const spec = loadOpenApiSpec();
    const product = spec.components?.schemas?.Product ?? {};
    const create = spec.components?.schemas?.ProductCreate ?? {};
    expect(product.properties ?? {}).not.toHaveProperty('priceAmount');
    expect(product.properties ?? {}).not.toHaveProperty('billingCycle');
    expect(create.properties ?? {}).not.toHaveProperty('priceAmount');
    expect(create.properties ?? {}).not.toHaveProperty('billingCycle');
    expect(create.additionalProperties).toBe(false);
    expect(product.additionalProperties).toBe(false);

    const raw = parseYaml(readFileSync(openApiSpecPath, 'utf8')) as {
      paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
    };
    const responses = raw.paths['/api/v1/products']!.post!.responses as Record<string, unknown>;
    expect(responses['201']).toBeDefined();
    expect(responses['409']).toBeDefined();
    expect(responses['422']).toBeDefined();
  });

  it('T-HU05-08 — Product, ProductCreate y ProductUpdate rechazan propiedades extra (AJV)', () => {
    const validProduct = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Ejemplo',
      description: null,
      productType: 'own',
      vendor: null,
      referenceCode: null,
      status: 'active',
      createdAt: '2026-11-01T12:00:00.000Z',
      updatedAt: '2026-11-01T12:00:00.000Z',
    };
    assertValidComponentSchema('Product', validProduct);
    assertInvalidComponentSchema('Product', { ...validProduct, priceAmount: '100.00' });

    assertValidComponentSchema('ProductCreate', {
      name: 'Licencia',
      productType: 'third_party',
      vendor: 'Vendor',
    });
    assertInvalidComponentSchema('ProductCreate', {
      name: 'Licencia',
      productType: 'third_party',
      priceAmount: '1.00',
    });

    assertValidComponentSchema('ProductUpdate', { name: 'Nuevo nombre' });
    assertInvalidComponentSchema('ProductUpdate', { name: 'Nuevo', billingCycle: 'monthly' });
  });

  it('T-HU05-08 — valida request createProduct contra el OpenAPI', () => {
    expectRequestMatchesOperation(
      { name: 'Licencia', productType: 'third_party', vendor: 'Vendor' },
      'createProduct',
    );
  });
});
