/**
 * Gate prosecdef: GRANT fuera de allowlist debe hacer fallar db:migrate (fail-closed sin repair).
 */
import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const migUrl = process.env.DATABASE_MIGRATION_URL;
const provUrl = process.env.DATABASE_PROVISION_URL;

if (process.env.REQUIRE_DB_TESTS === '1' && (!migUrl || !provUrl)) {
  throw new Error('prosecdef-gate-mutation: URLs requeridas');
}

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

function runMigrate(): { status: number | null; text: string } {
  const run = spawnSync('pnpm', ['exec', 'tsx', 'scripts/dbmate-staged-up.ts'], {
    cwd: backendRoot,
    env: process.env as NodeJS.ProcessEnv,
    encoding: 'utf8',
  });
  return { status: run.status, text: `${run.stderr}\n${run.stdout}` };
}

describe.skipIf(!migUrl || !provUrl)('prosecdef gate mutations', () => {
  const owner = new pg.Pool({ connectionString: provUrl!, max: 1 });

  afterAll(async () => {
    await owner.end();
  });

  it('GRANT EXECUTE bootstrap_first_admin a PUBLIC → db:migrate falla sin repair', async () => {
    const c = await owner.connect();
    try {
      await c.query(
        `grant execute on function app.bootstrap_first_admin(text, text, text) to public`,
      );
    } finally {
      c.release();
    }
    const { status, text } = runMigrate();
    expect(status).not.toBe(0);
    expect(text).toMatch(/prosecdef|PUBLIC|Gate|EXECUTE/i);
    const fix = await owner.connect();
    try {
      await fix.query(
        `revoke execute on function app.bootstrap_first_admin(text, text, text) from public`,
      );
    } finally {
      fix.release();
    }
  });

  it('GRANT EXECUTE auth_password_hash a fabsoft_worker → db:migrate falla', async () => {
    const c = await owner.connect();
    try {
      await c.query(`grant execute on function app.auth_password_hash(uuid) to fabsoft_worker`);
    } finally {
      c.release();
    }
    const { status, text } = runMigrate();
    expect(status).not.toBe(0);
    expect(text).toMatch(/auth_password_hash|fabsoft_worker|Gate prosecdef/i);
    const fix = await owner.connect();
    try {
      await fix.query(`revoke execute on function app.auth_password_hash(uuid) from fabsoft_worker`);
    } finally {
      fix.release();
    }
  });
});
