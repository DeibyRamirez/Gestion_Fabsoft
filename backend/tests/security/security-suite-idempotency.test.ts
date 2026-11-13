/**
 * test:security idempotente — dos corridas consecutivas sobre la misma BD deben pasar.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const backendRoot = fileURLToPath(new URL('../..', import.meta.url));

function runSecurity(): { status: number | null; out: string } {
  const run = spawnSync('pnpm', ['test:security'], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: { ...process.env, REQUIRE_DB_TESTS: '1', SKIP_SECURITY_IDEMPOTENCY: '1' },
  });
  return { status: run.status, out: `${run.stdout}\n${run.stderr}` };
}

describe('test:security idempotente', () => {
  it('SKIP_SECURITY_IDEMPOTENCY=1 no deshabilita esta suite', () => {
    expect(process.env.SKIP_SECURITY_IDEMPOTENCY).not.toBe('1');
  });

  it('dos corridas consecutivas en verde', () => {
    const first = runSecurity();
    expect(first.status, first.out).toBe(0);
    const second = runSecurity();
    expect(second.status, second.out).toBe(0);
  }, 600_000);
});
