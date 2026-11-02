import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@fabsoft/shared';
import { GetLiveness } from './use-case.js';

describe('GetLiveness', () => {
  it('devuelve status ok y la versión del proveedor', () => {
    const result = new GetLiveness({ version: () => '1.2.3' }).execute();
    expect(HealthResponseSchema.parse(result)).toEqual({ status: 'ok', version: '1.2.3' });
  });
});
