import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

function normalizeSummaryKey(key: string, cwd: string): string | null {
  if (key === 'total') return null;
  const rel = relative(cwd, key).replace(/\\/g, '/');
  if (!rel.startsWith('..')) return rel;
  return key.replace(/\\/g, '/');
}

/** Falla si COVERAGE_REQUIRED_PATHS lista rutas sin archivos medidos en coverage-summary.json. */
export function checkCoveragePaths(options: {
  summaryPath: string;
  requiredPaths: string[];
  cwd?: string;
}): void {
  const { summaryPath, requiredPaths, cwd = process.cwd() } = options;
  if (requiredPaths.length === 0) return;
  if (!existsSync(summaryPath)) {
    throw new Error(`No existe ${summaryPath}; ejecuta pnpm test:coverage primero`);
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as Record<
    string,
    { lines?: { total?: number } }
  >;
  const missing: string[] = [];
  for (const required of requiredPaths) {
    const prefix = required.endsWith('/') ? required : `${required}/`;
    const hasFile = Object.keys(summary).some((key) => {
      const rel = normalizeSummaryKey(key, cwd);
      return rel !== null && rel.startsWith(prefix);
    });
    if (!hasFile) missing.push(required);
  }
  if (missing.length) {
    throw new Error(`Rutas en COVERAGE_REQUIRED_PATHS sin archivos medidos: ${missing.join(', ')}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const required = (process.env.COVERAGE_REQUIRED_PATHS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  checkCoveragePaths({
    summaryPath: join(process.cwd(), 'coverage', 'coverage-summary.json'),
    requiredPaths: required,
  });
}
