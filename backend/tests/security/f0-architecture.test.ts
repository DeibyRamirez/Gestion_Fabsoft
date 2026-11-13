/**
 * T-F0-05 — tests API/integración/security sin bypass owner (withOwnerSystemContext / owner-system).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectsOwnerBypassInTestSource } from '../helpers/owner-bypass-detector.js';

const testsRoot = fileURLToPath(new URL('..', import.meta.url));

const SCAN_DIRS = ['security', 'api', 'integration'] as const;

/** Únicos archivos que pueden importar helpers/owner-system (fixtures de seguridad). */
const OWNER_SYSTEM_ALLOWLIST = new Set([
  'fixtures/factories.ts',
  'helpers/owner-bypass-detector.ts',
  'helpers/owner-system.ts',
  'helpers/db.ts',
]);

const OWNER_SYSTEM_MODULE = /helpers\/owner-system(?:\.js)?['"]/;

function collectTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collectTestFiles(full));
    } else if (name.endsWith('.test.ts') && name !== 'f0-architecture.test.ts') {
      out.push(full);
    }
  }
  return out;
}

describe('F0 — arquitectura tests (sin bypass owner)', () => {
  const evasions: { label: string; body: string }[] = [
    {
      label: 'import * as h',
      body: `import * as h from '../helpers/owner-system.js';\nawait h.withOwnerSystemContext(async () => {});`,
    },
    {
      label: 'desestructuración alias',
      body: `import { withOwnerSystemContext as ctx } from '../helpers/owner-system.js';\nawait ctx(async () => {});`,
    },
    {
      label: 'import() ruta concatenada',
      body: `const p = '../helpers/' + 'owner-system.js';\nconst m = await import(p);\nawait m.withOwnerSystemContext(async () => {});`,
    },
    {
      label: 're-export * hermano',
      body: `export * from './owner-system.js';\nexport { withOwnerSystemContext as ctx };`,
    },
    {
      label: 're-export nombrado',
      body: `export { withOwnerSystemContext as ctx } from '../helpers/owner-system.js';`,
    },
    {
      label: 'getOwnerPool directo',
      body: `import { getOwnerPool } from '../helpers/db.js';\nawait getOwnerPool().query('select 1');`,
    },
  ];

  for (const ev of evasions) {
    it(`T-F0-05 detecta evasión QA: ${ev.label}`, () => {
      expect(detectsOwnerBypassInTestSource(ev.body)).toBe(true);
    });
  }

  it('T-F0-05 ningún *.test.ts en security/api/integration referencia owner-system / withOwnerSystemContext / getOwnerPool', () => {
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
    expect(
      offenders,
      `Usar fabsoft_app/API; no owner bypass: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('T-F0-05 allowlist owner-system: sólo fixtures autorizados', () => {
    const offenders: string[] = [];
    function walk(dir: string, rel = ''): void {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const relPath = rel ? `${rel}/${name}` : name;
        if (statSync(full).isDirectory()) walk(full, relPath);
        else if (
          name.endsWith('.ts') &&
          !name.endsWith('.test.ts') &&
          OWNER_SYSTEM_MODULE.test(readFileSync(full, 'utf8'))
        ) {
          if (!OWNER_SYSTEM_ALLOWLIST.has(relPath)) offenders.push(relPath);
        }
      }
    }
    walk(testsRoot);
    expect(offenders, `Import owner-system fuera de allowlist: ${offenders.join(', ')}`).toEqual(
      [],
    );
  });

  it('T-F0-05 helpers sin re-export de owner-system', () => {
    const helpersDir = join(testsRoot, 'helpers');
    const bad: string[] = [];
    for (const name of readdirSync(helpersDir)) {
      if (!name.endsWith('.ts') || name === 'owner-system.ts') continue;
      const body = readFileSync(join(helpersDir, name), 'utf8');
      if (/export\s+\*\s+from\s+['"][^'"]*owner-system/.test(body)) bad.push(name);
    }
    expect(bad).toEqual([]);
  });
});
