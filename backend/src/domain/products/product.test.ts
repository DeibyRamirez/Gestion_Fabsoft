import { describe, expect, it } from 'vitest';
import { productIdentityKey } from './product.js';

describe('productIdentityKey', () => {
  it('normaliza nombre y proveedor como el índice único', () => {
    expect(productIdentityKey('  Office 365 ', ' Microsoft ')).toBe('office 365|microsoft');
    expect(productIdentityKey('Licencia', null)).toBe('licencia|');
  });
});
