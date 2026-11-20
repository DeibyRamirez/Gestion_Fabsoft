import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Documento OpenAPI ya generado (ver `pnpm openapi:build`). */
export type OpenApiDocument = Record<string, unknown>;

const moduleDir = dirname(fileURLToPath(import.meta.url));

const candidates = (): string[] => {
  const fromEnv = process.env['OPENAPI_SPEC_PATH'];
  return [
    ...(fromEnv ? [resolve(fromEnv)] : []),
    join(process.cwd(), 'docs/api/openapi.json'),
    join(process.cwd(), '../docs/api/openapi.json'),
    // src/interfaces/http/openapi y dist/interfaces/http/openapi → raíz del repo.
    join(moduleDir, '../../../../../docs/api/openapi.json'),
  ];
};

let cached: OpenApiDocument | undefined;

export function findOpenApiSpecPath(): string | null {
  return candidates().find((path) => existsSync(path)) ?? null;
}

export function loadOpenApiDocument(): OpenApiDocument {
  if (cached) return cached;
  const path = findOpenApiSpecPath();
  if (!path) {
    throw new Error(
      'No se encontró docs/api/openapi.json. Ejecute `pnpm openapi:build` o defina OPENAPI_SPEC_PATH.',
    );
  }
  cached = JSON.parse(readFileSync(path, 'utf8')) as OpenApiDocument;
  return cached;
}
