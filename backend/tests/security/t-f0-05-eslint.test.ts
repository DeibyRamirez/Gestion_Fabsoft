/**
 * T-F0-05 mutaciones ESLint: patrones PO deben reportar error (config real del repo).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const backendRoot = fileURLToPath(new URL('../..', import.meta.url));

function eslintOn(file: string): { status: number | null; out: string } {
  const run = spawnSync(
    'pnpm',
    [
      'exec',
      'eslint',
      '--config',
      'eslint.config.js',
      file,
      '--no-ignore',
      '--max-warnings',
      '0',
    ],
    {
      cwd: backendRoot,
      encoding: 'utf8',
      env: { ...process.env, T_F0_05_FIXTURE_LINT: '1' },
    },
  );
  return { status: run.status, out: `${run.stdout}\n${run.stderr}` };
}

const fixtures = [
  {
    label: 're-export withOwnerSystemContext as ctx en helper',
    file: 'tests/eslint-fixtures/t-f0-05/bad-helper-reexport.ts',
    pattern: /T-F0-05|owner-system|re-export/i,
  },
  {
    label: 'helper con getOwnerPool import',
    file: 'tests/eslint-fixtures/t-f0-05/bad-helper-owner-pool.ts',
    pattern: /T-F0-05|getOwnerPool/i,
  },
  {
    label: "db['getOwner'+'Pool'] en helper",
    file: 'tests/eslint-fixtures/t-f0-05/bad-helper-computed-pool.ts',
    pattern: /T-F0-05|computad|getOwnerPool/i,
  },
  {
    label: 'helper envuelve import() literal owner-system',
    file: 'tests/eslint-fixtures/t-f0-05/bad-helper-owner-dynamic-import.ts',
    pattern: /T-F0-05|owner-system|import\(\)/i,
  },
  {
    label: 'import() no literal en test',
    file: 'tests/eslint-fixtures/t-f0-05/bad-dynamic-import.test.ts',
    pattern: /T-F0-05|import\(\)/i,
  },
] as const;

describe('T-F0-05 ESLint (mutaciones)', () => {
  for (const fx of fixtures) {
    it(`lint ROJO: ${fx.label}`, () => {
      const { status, out } = eslintOn(fx.file);
      expect(status, out).not.toBe(0);
      expect(out).toMatch(fx.pattern);
    });
  }
});
