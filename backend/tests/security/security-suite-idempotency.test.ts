/**
 * test:security idempotente — dos corridas consecutivas sobre la misma BD deben pasar.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const backendRoot = fileURLToPath(new URL('../..', import.meta.url));

async function runSecurity(): Promise<{ status: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['test:security'], {
      cwd: backendRoot,
      env: { ...process.env, REQUIRE_DB_TESTS: '1' },
    });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      out += String(chunk);
    });
    child.on('close', (status) => resolve({ status, out }));
  });
}

describe('test:security idempotente', () => {
  it('SKIP_SECURITY_IDEMPOTENCY=1 no deshabilita esta suite', () => {
    const vitestCfg = readFileSync(join(backendRoot, 'vitest.config.ts'), 'utf8');
    expect(vitestCfg).not.toMatch(/SKIP_SECURITY_IDEMPOTENCY/);
    const probe = spawnSync(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--project',
        'security',
        'tests/security/audit-redact.test.ts',
      ],
      {
        cwd: backendRoot,
        encoding: 'utf8',
        env: { ...process.env, REQUIRE_DB_TESTS: '1', SKIP_SECURITY_IDEMPOTENCY: '1' },
      },
    );
    expect(probe.status, `${probe.stderr}\n${probe.stdout}`).toBe(0);
  });

  it('dos corridas consecutivas en verde', async () => {
    const first = await runSecurity();
    expect(first.status, first.out).toBe(0);
    const second = await runSecurity();
    expect(second.status, second.out).toBe(0);
  }, 600_000);
});
