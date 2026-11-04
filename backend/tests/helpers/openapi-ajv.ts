import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import _Ajv2020 from 'ajv/dist/2020.js';
import _addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import { parse as parseYaml } from 'yaml';

const Ajv2020 = _Ajv2020 as unknown as new (opts?: object) => {
  compile: (schema: Record<string, unknown>) => ValidateFunction;
};
const addFormats = _addFormats as unknown as (ajv: InstanceType<typeof Ajv2020>) => void;

export type OpenApiDoc = {
  paths?: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        requestBody?: {
          content?: Record<string, { schema?: unknown }>;
        };
        responses?: Record<
          string,
          { content?: Record<string, { schema?: unknown }> }
        >;
      }
    >
  >;
  components?: { schemas?: Record<string, Record<string, unknown>> };
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
export const openApiSpecPath = join(repoRoot, 'docs/api/openapi.yaml');

let cachedSpec: OpenApiDoc | undefined;
let dereferencedSpec: OpenApiDoc | undefined;
let ajv: InstanceType<typeof Ajv2020> | undefined;
const validatorCache = new Map<string, ValidateFunction>();

export function loadOpenApiSpec(): OpenApiDoc {
  cachedSpec ??= parseYaml(readFileSync(openApiSpecPath, 'utf8')) as OpenApiDoc;
  return cachedSpec;
}

export async function initOpenApiValidation(): Promise<void> {
  if (dereferencedSpec && ajv) return;
  dereferencedSpec = (await $RefParser.dereference(
    openApiSpecPath,
  )) as OpenApiDoc;
  ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    validateSchema: false,
  });
  addFormats(ajv);
}

function requireAjv(): InstanceType<typeof Ajv2020> {
  if (!ajv) {
    throw new Error('OpenAPI AJV no inicializado: llame initOpenApiValidation()');
  }
  return ajv;
}

function requireDereferenced(): OpenApiDoc {
  if (!dereferencedSpec) {
    throw new Error('OpenAPI dereferenciado no cargado: llame initOpenApiValidation()');
  }
  return dereferencedSpec;
}

export function getComponentSchema(name: string): Record<string, unknown> {
  const schema = requireDereferenced().components?.schemas?.[name];
  if (!schema) throw new Error(`Esquema OpenAPI desconocido: ${name}`);
  return schema;
}

export function compileOpenApiSchema(
  key: string,
  schema: Record<string, unknown>,
): ValidateFunction {
  let validate = validatorCache.get(key);
  if (!validate) {
    validate = requireAjv().compile(schema);
    validatorCache.set(key, validate);
  }
  return validate;
}

export function validateOpenApiComponent(
  name: string,
  data: unknown,
): { ok: boolean; errors: ValidateFunction['errors'] } {
  const validate = compileOpenApiSchema(`component:${name}`, getComponentSchema(name));
  return { ok: validate(data) === true, errors: validate.errors };
}

export function findOperation(
  operationId: string,
  spec: OpenApiDoc = loadOpenApiSpec(),
): {
  path: string;
  method: string;
  operation: NonNullable<OpenApiDoc['paths']>[string][string];
} | null {
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (operation?.operationId === operationId) {
        return { path, method, operation };
      }
    }
  }
  return null;
}

export function getDereferencedSpec(): OpenApiDoc {
  return requireDereferenced();
}

export function responseSchemaForOperation(
  operation: NonNullable<ReturnType<typeof findOperation>>['operation'],
  status: number,
): Record<string, unknown> {
  const entry = operation.responses?.[String(status)];
  const content =
    entry?.content?.['application/json'] ?? entry?.content?.['application/problem+json'];
  const schema = content?.schema;
  if (!schema || typeof schema !== 'object') {
    throw new Error(`OpenAPI sin schema JSON para status ${status}`);
  }
  return schema as Record<string, unknown>;
}

export function requestSchemaForOperation(
  operation: NonNullable<ReturnType<typeof findOperation>>['operation'],
): Record<string, unknown> {
  const schema = operation.requestBody?.content?.['application/json']?.schema;
  if (!schema || typeof schema !== 'object') {
    throw new Error('OpenAPI sin requestBody application/json');
  }
  return schema as Record<string, unknown>;
}
