import { describe, expect, it } from 'vitest';
import { normalizeTaxId } from './tax-id.js';

describe('normalizeTaxId', () => {
  it('mayúsculas y elimina separadores como la columna generada', () => {
    expect(normalizeTaxId('900.123.456-7')).toBe('9001234567');
    expect(normalizeTaxId('900123456-7')).toBe('9001234567');
    expect(normalizeTaxId('  ab-12 ')).toBe('AB12');
  });
});