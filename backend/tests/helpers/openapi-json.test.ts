import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { openApiSpecPath } from './openapi.js';

const jsonPath = join(dirname(openApiSpecPath), 'openapi.json');

describe('OpenAPI JSON generado', () => {
  it('coincide con la fuente YAML versionada', () => {
    const yaml = parseYaml(readFileSync(openApiSpecPath, 'utf8')) as unknown;
    const json = JSON.parse(readFileSync(jsonPath, 'utf8')) as unknown;
    expect(json).toEqual(yaml);
  });
});
