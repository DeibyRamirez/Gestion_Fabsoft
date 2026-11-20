import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

/**
 * Genera `docs/api/openapi.json` desde la fuente canónica en YAML.
 * `--check` falla si el JSON versionado no coincide (CI).
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const yamlPath = join(repoRoot, 'docs/api/openapi.yaml');
const jsonPath = join(repoRoot, 'docs/api/openapi.json');

const document = parseYaml(readFileSync(yamlPath, 'utf8')) as unknown;
const json = `${JSON.stringify(document, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const current = existsSync(jsonPath) ? readFileSync(jsonPath, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== json) {
    console.error(
      'docs/api/openapi.json está desactualizado. Ejecute `pnpm openapi:build` y versione el resultado.',
    );
    process.exitCode = 1;
  }
} else {
  writeFileSync(jsonPath, json, 'utf8');
  console.log(`openapi.json generado (${Buffer.byteLength(json)} bytes)`);
}
