import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Test de arquitectura (docs/architecture.md §2): recorre imports y verifica la dirección de dependencias. */
const SRC = join(import.meta.dirname, '../../src');
const FORBIDDEN: Record<string, string[]> = {
  domain: ['application', 'infrastructure', 'interfaces', 'composition'],
  application: ['infrastructure', 'interfaces', 'composition'],
  infrastructure: ['interfaces', 'composition'],
  interfaces: ['infrastructure', 'composition'],
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('reglas de capas', () => {
  for (const file of files(SRC)) {
    const layer = relative(SRC, file).split('/')[0] ?? '';
    const forbidden = FORBIDDEN[layer];
    if (!forbidden) continue;
    it(`${relative(SRC, file)} respeta su capa`, () => {
      const imports = [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map(
        (m) => m[1] ?? '',
      );
      const bad = imports.filter(
        (i) => i.startsWith('.') && forbidden.some((l) => i.includes(`/${l}/`)),
      );
      expect(bad).toEqual([]);
    });
  }
});
