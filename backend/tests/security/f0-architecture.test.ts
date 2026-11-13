/**
 * T-F0-05 — respaldo vitest (lint primario en eslint.f0-05.js).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  detectsOwnerBypassInTestSource,
  hasNonLiteralDynamicImport,
} from '../helpers/owner-bypass-detector.js';

const testsRoot = fileURLToPath(new URL('..', import.meta.url));

const SCAN_DIRS = ['security', 'api', 'integration'] as const;

const OWNER_SYSTEM_ALLOWLIST = new Set([
  'fixtures/factories.ts',
  'helpers/owner-bypass-detector.ts',
  'helpers/owner-system.ts',
  'helpers/db.ts',
]);

const OWNER_SYSTEM_MODULE = /helpers\/owner-system(?:\.js|\.ts)?['"]/;

function collectTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collectTestFiles(full));
    } else if (
      name.endsWith('.test.ts') &&
      name !== 'f0-architecture.test.ts' &&
      name !== 't-f0-05-eslint.test.ts'
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('F0 — arquitectura tests (sin bypass owner)', () => {
  const poMutations: { label: string; body: string }[] = [
    {
      label: '(1) re-export símbolo owner-system con alias en helper',
      body: `export { withOwnerSystemContext as ctx } from '../helpers/owner-system.js';`,
    },
    {
      label: '(2) helper fuera de allowlist con getOwnerPool',
      body: `import { getOwnerPool } from './db.js';\nexport const x = () => getOwnerPool();`,
    },
    {
      label: '(2b) import() con clave computada hacia owner',
      body: `const k = 'owner-system.js';\nawait import(\`../helpers/\${k}\`);`,
    },
    {
      label: '(3) import() no literal en test',
      body: `const p = '../helpers/' + 'owner-system.js';\nconst m = await import(p);`,
    },
  ];

  for (const ev of poMutations) {
    it(`T-F0-05 mutación QA: ${ev.label}`, () => {
      const nonLiteral = hasNonLiteralDynamicImport(ev.body);
      const bypass = detectsOwnerBypassInTestSource(ev.body);
      expect(bypass || nonLiteral).toBe(true);
      if (ev.label.includes('import()') || ev.label.includes('clave computada')) {
        expect(nonLiteral).toBe(true);
      }
    });
  }

  it('T-F0-05 ningún *.test.ts en security/api/integration referencia bypass owner', () => {
    const offenders: string[] = [];
    for (const sub of SCAN_DIRS) {
      const dir = join(testsRoot, sub);
      for (const file of collectTestFiles(dir)) {
        const body = readFileSync(file, 'utf8');
        if (detectsOwnerBypassInTestSource(body)) {
          offenders.push(relative(testsRoot, file));
        }
      }
    }
    expect(offenders, offenders.join(', ')).toEqual([]);
  });

  it('T-F0-05 allowlist owner-system imports', () => {
    const offenders: string[] = [];
    function walk(dir: string, rel = ''): void {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const relPath = rel ? `${rel}/${name}` : name;
        if (statSync(full).isDirectory()) {
          if (relPath === 'eslint-fixtures') continue;
          walk(full, relPath);
          continue;
        }
        else if (
          name.endsWith('.ts') &&
          !name.endsWith('.test.ts') &&
          relPath !== 'security/f0-architecture.test.ts' &&
          relPath !== 'helpers/owner-bypass-detector.ts' &&
          OWNER_SYSTEM_MODULE.test(readFileSync(full, 'utf8'))
        ) {
          if (!OWNER_SYSTEM_ALLOWLIST.has(relPath)) offenders.push(relPath);
        }
      }
    }
    walk(testsRoot);
    expect(offenders).toEqual([]);
  });
});
