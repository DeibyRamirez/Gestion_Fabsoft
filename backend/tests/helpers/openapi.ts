import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { Response } from 'supertest';
import { expect } from 'vitest';
import { HealthResponseSchema } from '@fabsoft/shared';

type OpenApiDoc = {
  paths?: Record<
    string,
    Record<string, { operationId?: string; responses?: Record<string, unknown> }>
  >;
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const specPath = join(repoRoot, 'docs/api/openapi.yaml');
let cachedSpec: OpenApiDoc | undefined;

function loadSpec(): OpenApiDoc {
  cachedSpec ??= parseYaml(readFileSync(specPath, 'utf8')) as OpenApiDoc;
  return cachedSpec;
}

function operationExists(operationId: string): boolean {
  for (const pathItem of Object.values(loadSpec().paths ?? {})) {
    for (const op of Object.values(pathItem)) {
      if (op?.operationId === operationId) return true;
    }
  }
  return false;
}

/** Valida el cuerpo JSON de una respuesta HTTP contra la operación OpenAPI (por operationId). */
export function expectMatchesOperation(res: Response, operationId: string): void {
  if (!operationExists(operationId)) {
    throw new Error(`operationId desconocido en OpenAPI: ${operationId}`);
  }
  if (operationId === 'getHealth' || operationId === 'getReadiness') {
    expect(res.headers['content-type']).toMatch(/application\/json/);
    HealthResponseSchema.parse(res.body);
    return;
  }
  throw new Error(`expectMatchesOperation: sin validador para ${operationId}`);
}
