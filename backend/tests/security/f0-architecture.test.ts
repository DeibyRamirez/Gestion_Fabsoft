/**
 * T-F0-05 — tests API/integración/security sin withOwnerSystemContext (arquitectura runtime).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testsRoot = fileURLToPath(new URL('..', import.meta.url));

const SCAN_DIRS = ['security', 'api', 'integration'] as const;

/** Import real del helper (cualquier ruta relativa/alias hacia tests/helpers/db). */
const OWNER_BYPASS_IMPORT =
  /import\s+(?:type\s+)?\{[^}]*\bwithOwnerSystemContext\b[^}]*\}\s*from\s+['"][^'"]*helpers\/db(?:\.js)?['"]/;

function collectTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...collectTestFiles(full));
    } else if (name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('F0 — arquitectura tests (sin bypass owner)', () => {
  it('T-F0-05 ningún *.test.ts en security/api/integration importa withOwnerSystemContext', () => {
    const offenders: string[] = [];
    for (const sub of SCAN_DIRS) {
      const dir = join(testsRoot, sub);
      for (const file of collectTestFiles(dir)) {
        const body = readFileSync(file, 'utf8');
        if (OWNER_BYPASS_IMPORT.test(body)) {
          offenders.push(relative(testsRoot, file));
        }
      }
    }
    expect(
      offenders,
      `Verificar con fabsoft_app o API; no owner bypass: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
