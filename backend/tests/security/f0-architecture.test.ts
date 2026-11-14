/**
 * T-F0-05 — respaldo vitest (lint primario en eslint.f0-05.js).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectsOwnerBypassInTestSource } from '../helpers/owner-bypass-detector.js';

const testsRoot = fileURLToPath(new URL('..', import.meta.url));

const SCAN_TEST_DIRS = ['security', 'api', 'integration'] as const;

const HELPER_FIXTURE_ALLOWLIST = new Set([
  'helpers/owner-system.ts',
  'helpers/db.ts',
  'helpers/owner-bypass-detector.ts',
  'fixtures/factories.ts',
]);

const OWNER_SYSTEM_MODULE = /helpers\/owner-system(?:\.js|\.ts)?['"]/;
const EXPORT_STAR_OWNER = /export\s+\*\s+from\s+['"][^'"]*owner-system[^'"]*['"]/;

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

function collectHelperAndFixtureSources(): { rel: string; body: string }[] {
  const out: { rel: string; body: string }[] = [];
  for (const sub of ['helpers', 'fixtures'] as const) {
    const dir = join(testsRoot, sub);
    function walk(current: string, relPrefix: string): void {
      for (const name of readdirSync(current)) {
        const full = join(current, name);
        const rel = `${relPrefix}/${name}`;
        if (statSync(full).isDirectory()) {
          walk(full, rel);
          continue;
        }
        if (!name.endsWith('.ts') || rel === 'helpers/owner-bypass-detector.ts') continue;
        out.push({ rel, body: readFileSync(full, 'utf8') });
      }
    }
    walk(dir, sub);
  }
  return out;
}

describe('F0 — arquitectura tests (sin bypass owner)', () => {
  it('T-F0-05 ningún *.test.ts en security/api/integration referencia bypass owner', () => {
    const offenders: string[] = [];
    for (const sub of SCAN_TEST_DIRS) {
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

  it('T-F0-05 helpers/fixtures reales sin bypass (scan directorio)', () => {
    const offenders: string[] = [];
    for (const { rel, body } of collectHelperAndFixtureSources()) {
      if (HELPER_FIXTURE_ALLOWLIST.has(rel)) continue;
      if (detectsOwnerBypassInTestSource(body)) offenders.push(rel);
    }
    expect(offenders, offenders.join(', ')).toEqual([]);
  });

  it('T-F0-05 export * desde owner-system en helper da ROJO (respaldo)', () => {
    const offenders: string[] = [];
    for (const { rel, body } of collectHelperAndFixtureSources()) {
      if (HELPER_FIXTURE_ALLOWLIST.has(rel)) continue;
      if (EXPORT_STAR_OWNER.test(body)) offenders.push(rel);
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
        } else if (
          name.endsWith('.ts') &&
          !name.endsWith('.test.ts') &&
          relPath !== 'security/f0-architecture.test.ts' &&
          relPath !== 'helpers/owner-bypass-detector.ts' &&
          OWNER_SYSTEM_MODULE.test(readFileSync(full, 'utf8'))
        ) {
          if (!HELPER_FIXTURE_ALLOWLIST.has(relPath)) offenders.push(relPath);
        }
      }
    }
    walk(testsRoot);
    expect(offenders).toEqual([]);
  });

  it('T-F0-05 globs ESLint existen y cubren tests/security', () => {
    const backendRoot = fileURLToPath(new URL('../..', import.meta.url));
    const globDirs = ['tests/security', 'tests/api', 'tests/integration'];
    for (const rel of globDirs) {
      expect(existsSync(join(backendRoot, rel)), rel).toBe(true);
    }
    const eslintConfig = readFileSync(join(backendRoot, 'eslint.f0-05.js'), 'utf8');
    expect(eslintConfig).toMatch(/tests\/\{security,api,integration\}/);
    const secDir = join(testsRoot, 'security');
    const covered = collectTestFiles(secDir);
    expect(covered.length).toBeGreaterThan(3);
    const sample = covered.find((f) => f.includes('foundation-f0.test.ts'));
    expect(sample).toBeTruthy();
    const body = readFileSync(sample!, 'utf8');
    expect(detectsOwnerBypassInTestSource(body)).toBe(false);
  });
});
