import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCoveragePaths } from './check-coverage-paths.js';

describe('check-coverage-paths', () => {
  it('falla cuando una ruta requerida no tiene archivos medidos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cov-'));
    const summaryPath = join(dir, 'coverage-summary.json');
    writeFileSync(
      summaryPath,
      JSON.stringify({
        total: { lines: { total: 1, covered: 1 } },
        'src/domain/users/foo.ts': { lines: { total: 10, covered: 10 } },
      }),
    );
    expect(() =>
      checkCoveragePaths({
        summaryPath,
        requiredPaths: ['src/domain/subscriptions'],
        cwd: dir,
      }),
    ).toThrow(/subscriptions/);
  });

  it('acepta claves absolutas normalizadas respecto a cwd', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cov-'));
    const backendRoot = join(dir, 'backend');
    mkdirSync(join(backendRoot, 'src/domain/subscriptions'), { recursive: true });
    const absFile = join(backendRoot, 'src/domain/subscriptions/state.ts');
    const summaryPath = join(backendRoot, 'coverage-summary.json');
    writeFileSync(
      summaryPath,
      JSON.stringify({
        total: { lines: { total: 1, covered: 1 } },
        [absFile]: { lines: { total: 10, covered: 10 } },
      }),
    );
    expect(() =>
      checkCoveragePaths({
        summaryPath,
        requiredPaths: ['src/domain/subscriptions'],
        cwd: backendRoot,
      }),
    ).not.toThrow();
  });

  it('no falla con COVERAGE_REQUIRED_PATHS vacío', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cov-'));
    const summaryPath = join(dir, 'coverage-summary.json');
    writeFileSync(summaryPath, JSON.stringify({ total: {} }));
    expect(() => checkCoveragePaths({ summaryPath, requiredPaths: [] })).not.toThrow();
  });
});
