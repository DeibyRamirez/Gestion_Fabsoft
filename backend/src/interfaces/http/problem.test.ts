import { describe, expect, it } from 'vitest';
import { ProblemCodeSchema } from '@fabsoft/shared';
import { STATUS_BY_CODE } from './problem.js';

describe('STATUS_BY_CODE — mapa código HTTP', () => {
  it('T-HU05-03 — validation_error permanece en 400', () => {
    expect(STATUS_BY_CODE.validation_error).toBe(400);
  });

  it('T-HU05-03 — invalid_state_transition permanece en 422', () => {
    expect(STATUS_BY_CODE.invalid_state_transition).toBe(422);
  });

  it('T-HU05-03 — códigos 422 de reglas de negocio', () => {
    expect(STATUS_BY_CODE.product_inactive).toBe(422);
    expect(STATUS_BY_CODE.client_archived).toBe(422);
    expect(STATUS_BY_CODE.client_inactive).toBe(422);
  });

  it('T-HU05-03 — códigos 409 de conflicto', () => {
    expect(STATUS_BY_CODE.client_tax_id_taken).toBe(409);
    expect(STATUS_BY_CODE.primary_contact_conflict).toBe(409);
    expect(STATUS_BY_CODE.version_conflict).toBe(409);
    expect(STATUS_BY_CODE.duplicate_product).toBe(409);
  });

  it('cada ProblemCode del contrato tiene status HTTP', () => {
    for (const code of ProblemCodeSchema.options) {
      expect(STATUS_BY_CODE[code], `falta status para ${code}`).toBeTypeOf('number');
    }
  });
});
