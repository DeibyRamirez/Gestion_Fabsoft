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
    try {
      const { status, text } = runMigrate();
      expect(status).not.toBe(0);
      expect(text).toMatch(/prosecdef|PUBLIC|Gate|EXECUTE/i);
    } finally {
      const fix = await owner.connect();
      try {
        await fix.query(
          `revoke execute on function app.bootstrap_first_admin(text, text, text) from public`,
        );
      } finally {
        fix.release();
      }
    }
  });

  it('SECURITY DEFINER en public con EXECUTE a PUBLIC → db:migrate falla', async () => {
    const c = await owner.connect();
    try {
      await c.query(`
        create or replace function public.gate_mutation_evil_probe() returns void
        language sql security definer as $$ select 1 $$`);
      await c.query(`grant execute on function public.gate_mutation_evil_probe() to public`);
    } finally {
      c.release();
    }
    try {
      const { status, text } = runMigrate();
      expect(status).not.toBe(0);
      expect(text).toMatch(/allowlist|prosecdef|Gate/i);
    } finally {
      const fix = await owner.connect();
      try {
        await fix.query(`drop function if exists public.gate_mutation_evil_probe()`);
      } finally {
        fix.release();
      }
    }
  });

  it('GRANT EXECUTE auth_password_hash a fabsoft_migrator → db:migrate falla', async () => {
    const c = await owner.connect();
    try {
      await c.query(`grant execute on function app.auth_password_hash(uuid) to fabsoft_migrator`);
    } finally {
      c.release();
    }
    try {
      const { status, text } = runMigrate();
      expect(status).not.toBe(0);
      expect(text).toMatch(/auth_password_hash|fabsoft_migrator|Gate prosecdef/i);
    } finally {
      const fix = await owner.connect();
      try {
        await fix.query(
          `revoke execute on function app.auth_password_hash(uuid) from fabsoft_migrator`,
        );
      } finally {
        fix.release();
      }
    }
  });

  it('GRANT EXECUTE bootstrap_first_admin a fabsoft_seed_writer → db:migrate falla', async () => {
    const c = await owner.connect();
    try {
      await c.query(
        `grant execute on function app.bootstrap_first_admin(text, text, text) to fabsoft_seed_writer`,
      );
    } finally {
      c.release();
    }
    try {
      const { status, text } = runMigrate();
      expect(status).not.toBe(0);
      expect(text).toMatch(/bootstrap_first_admin|fabsoft_seed_writer|Gate prosecdef/i);
    } finally {
      const fix = await owner.connect();
      try {
        await fix.query(
          `revoke execute on function app.bootstrap_first_admin(text, text, text) from fabsoft_seed_writer`,
        );
      } finally {
        fix.release();
      }
    }
  });

  it('EXECUTE bootstrap vía membresía heredada (worker → rol hijo) → db:migrate falla', async () => {
    const c = await owner.connect();
    try {
      await c.query(`create role fabsoft_gate_inherit_probe nologin`);
      await c.query(`grant fabsoft_worker to fabsoft_gate_inherit_probe`);
      await c.query(
        `grant execute on function app.bootstrap_first_admin(text, text, text) to fabsoft_worker`,
      );
    } finally {
      c.release();
    }
    try {
      const { status, text } = runMigrate();
      expect(status).not.toBe(0);
      expect(text).toMatch(/bootstrap|fabsoft_gate_inherit_probe|Gate prosecdef/i);
    } finally {
      const fix = await owner.connect();
      try {
        await fix.query(
          `revoke execute on function app.bootstrap_first_admin(text, text, text) from fabsoft_worker`,
        );
        await fix.query(`drop role if exists fabsoft_gate_inherit_probe`);
      } finally {
        fix.release();
      }
    }
  });
});
