import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { Response } from 'supertest';
import { expect } from 'vitest';
import type { z } from 'zod';
import {
  HealthResponseSchema,
  ProblemSchema,
  ProductCreateSchema,
  ProductSchema,
} from '@fabsoft/shared';

type OpenApiDoc = {
  paths?: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        requestBody?: unknown;
        responses?: Record<string, unknown>;
      }
    >
  >;
  components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
export const openApiSpecPath = join(repoRoot, 'docs/api/openapi.yaml');

let cachedSpec: OpenApiDoc | undefined;

export function loadOpenApiSpec(): OpenApiDoc {
  cachedSpec ??= parseYaml(readFileSync(openApiSpecPath, 'utf8')) as OpenApiDoc;
  return cachedSpec;
}

export function findOperation(operationId: string): {
  path: string;
  method: string;
  operation: NonNullable<OpenApiDoc['paths']>[string][string];
} | null {
  for (const [path, pathItem] of Object.entries(loadOpenApiSpec().paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (operation?.operationId === operationId) {
        return { path, method, operation };
      }
    }
  }
  return null;
}

/** Esquemas Zod alineados con docs/api/openapi.yaml (refs resueltas vía @fabsoft/shared). */
const responseValidators: Record<string, Partial<Record<number, z.ZodType>>> = {
  getHealth: { 200: HealthResponseSchema },
  getReadiness: { 200: HealthResponseSchema },
  createProduct: {
    201: ProductSchema,
    409: ProblemSchema,
  },
  getProduct: { 200: ProductSchema },
};

const requestValidators: Record<string, z.ZodType | undefined> = {
  createProduct: ProductCreateSchema,
};

/** Valida el cuerpo JSON de una respuesta HTTP contra la operación OpenAPI (por operationId). */
export function expectMatchesOperation(res: Response, operationId: string): void {
  const op = findOperation(operationId);
  if (!op) {
    throw new Error(`operationId desconocido en OpenAPI: ${operationId}`);
  }
  const byStatus = responseValidators[operationId];
  if (!byStatus) {
    throw new Error(`expectMatchesOperation: sin validador para ${operationId}`);
  }
  const schema = byStatus[res.status];
  if (!schema) {
    throw new Error(
      `expectMatchesOperation: sin validador para ${operationId} con status ${res.status}`,
    );
  }
  expect(res.headers['content-type']).toMatch(/application\/(json|problem\+json)/);
  schema.parse(res.body);
}

/** Valida un cuerpo de petición contra el esquema de la operación (cuando está registrado). */
export function expectRequestMatchesOperation(body: unknown, operationId: string): void {
  const schema = requestValidators[operationId];
  if (!schema) {
    throw new Error(`expectRequestMatchesOperation: sin validador para ${operationId}`);
  }
  schema.parse(body);
}
