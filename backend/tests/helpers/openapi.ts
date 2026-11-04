import type { Response } from 'supertest';
import { expect } from 'vitest';
import {
  compileOpenApiSchema,
  findOperation,
  getDereferencedSpec,
  requestSchemaForOperation,
  responseSchemaForOperation,
  validateOpenApiComponent,
} from './openapi-ajv.js';

export {
  findOperation,
  getComponentSchema,
  initOpenApiValidation,
  loadOpenApiSpec,
  openApiSpecPath,
  type OpenApiDoc,
} from './openapi-ajv.js';

export function assertValidComponentSchema(name: string, data: unknown): void {
  const { ok, errors } = validateOpenApiComponent(name, data);
  expect(ok, JSON.stringify(errors)).toBe(true);
}

export function assertInvalidComponentSchema(name: string, data: unknown): void {
  const { ok } = validateOpenApiComponent(name, data);
  expect(ok).toBe(false);
}

export function expectMatchesOperation(res: Response, operationId: string): void {
  const op = findOperation(operationId, getDereferencedSpec());
  if (!op) {
    throw new Error(`operationId desconocido en OpenAPI: ${operationId}`);
  }
  const schema = responseSchemaForOperation(op.operation, res.status);
  const validate = compileOpenApiSchema(`${operationId}:${res.status}`, schema);
  const ok = validate(res.body);
  expect(ok, JSON.stringify(validate.errors)).toBe(true);
  expect(res.headers['content-type']).toMatch(/application\/(json|problem\+json)/);
}

export function expectRequestMatchesOperation(body: unknown, operationId: string): void {
  const op = findOperation(operationId, getDereferencedSpec());
  if (!op) throw new Error(`operationId desconocido: ${operationId}`);
  const schema = requestSchemaForOperation(op.operation);
  const validate = compileOpenApiSchema(`${operationId}:request`, schema);
  const ok = validate(body);
  expect(ok, JSON.stringify(validate.errors)).toBe(true);
}
