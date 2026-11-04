import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { ProductSchema } from '@fabsoft/shared';
import {
  expectRequestMatchesOperation,
  findOperation,
  loadOpenApiSpec,
  openApiSpecPath,
} from './openapi.js';

describe('OpenAPI helper — productos', () => {
  it('POST /api/v1/products define createProduct sin price ni billingCycle', () => {
    const op = findOperation('createProduct');
    expect(op).not.toBeNull();
    expect(op!.path).toBe('/api/v1/products');
    expect(op!.method).toBe('post');

    const spec = loadOpenApiSpec();
    const product = spec.components?.schemas?.Product?.properties ?? {};
    const create = spec.components?.schemas?.ProductCreate?.properties ?? {};
    expect(product).not.toHaveProperty('priceAmount');
    expect(product).not.toHaveProperty('billingCycle');
    expect(create).not.toHaveProperty('priceAmount');
    expect(create).not.toHaveProperty('billingCycle');

    const raw = parseYaml(readFileSync(openApiSpecPath, 'utf8')) as {
      paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
    };
    const responses = raw.paths['/api/v1/products']!.post!.responses as Record<string, unknown>;
    expect(responses['201']).toBeDefined();
    expect(responses['409']).toBeDefined();
  });

  it('ProductSchema compila respuesta 201 coherente con el contrato', () => {
    const parsed = ProductSchema.parse({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Ejemplo',
      description: null,
      productType: 'own',
      vendor: null,
      referenceCode: null,
      status: 'active',
      createdAt: '2026-11-01T12:00:00.000Z',
      updatedAt: '2026-11-01T12:00:00.000Z',
    });
    expect(parsed).not.toHaveProperty('priceAmount');
  });

  it('valida request createProduct con ProductCreateSchema', () => {
    expectRequestMatchesOperation(
      { name: 'Licencia', productType: 'third_party', vendor: 'Vendor' },
      'createProduct',
    );
  });
});
