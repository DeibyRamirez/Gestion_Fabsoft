/**
 * seed --reset conserva alert_rules, app_settings e integrations (sin CASCADE).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { parseDatabaseTarget } from '../../scripts/database-url.js';
import { findOrphanCoreForeignKeys } from './seed-reset-fk-integrity.js';

const backendRoot = fileURLToPath(new URL('../..', import.meta.url));
const seedUrl = process.env.SEED_DATABASE_URL;
const provUrl = process.env.DATABASE_PROVISION_URL;

describe.skipIf(
  !seedUrl || !provUrl || !process.env.SEED_EPHEMERAL_MARKER || !process.env.SEED_HARNESS_RUN_ID,
)('seed --reset datos de referencia', () => {
  it('tras --reset, ids/valores de referencia se conservan (T-F0-09c)', async () => {
    const t = parseDatabaseTarget(seedUrl!);
    const verifyUrl = provUrl ?? seedUrl!;
    const client = new pg.Client({ connectionString: verifyUrl });
    await client.connect();
    let beforeRules: { id: string; code: string }[] = [];
    let beforeSettings: { key: string; value: unknown }[] = [];
    let integrationCount = 0;
    try {
      const rules = await client.query<{ id: string; code: string }>(
        `select id::text, code from app.alert_rules order by code`,
      );
      beforeRules = rules.rows;
      const settings = await client.query<{ key: string; value: unknown }>(
        `select key, value from app.app_settings order by key`,
      );
      beforeSettings = settings.rows;
      const ints = await client.query<{ n: number }>(
        `select count(*)::int as n from app.integrations`,
      );
      integrationCount = ints.rows[0]!.n;
    } finally {
      await client.end();
    }

    const run = spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed.ts', '--reset'], {
      cwd: backendRoot,
      env: {
        ...process.env,
        APP_ENV: 'test',
        SEED_DATABASE_URL: seedUrl,
        SEED_ALLOWED_HOSTS: t.host,
        SEED_ALLOWED_PORTS: t.port,
        SEED_ALLOWED_DATABASES: t.database,
        SEED_FORBIDDEN_HOSTS: 'prod.example.com',
        SEED_ALLOW_RESET: '1',
        SEED_SESSION_ROLE: 'fabsoft_seed_writer',
      },
      encoding: 'utf8',
    });
    expect(run.status, `${run.stderr}${run.stdout}`).toBe(0);

    const after = new pg.Client({ connectionString: verifyUrl });
    await after.connect();
    try {
      const rules = await after.query<{ id: string; code: string }>(
        `select id::text, code from app.alert_rules order by code`,
      );
      expect(rules.rows).toEqual(beforeRules);
      expect(rules.rows.length).toBeGreaterThanOrEqual(6);
      const settings = await after.query<{ key: string; value: unknown }>(
        `select key, value from app.app_settings order by key`,
      );
      expect(settings.rows).toEqual(beforeSettings);
      expect(settings.rowCount).toBeGreaterThan(0);
      const ints = await after.query<{ n: number }>(
        `select count(*)::int as n from app.integrations`,
      );
      expect(ints.rows[0]!.n).toBe(integrationCount);
      const orphans = await findOrphanCoreForeignKeys(after);
      expect(orphans, `FK huérfanas: ${orphans.join('; ')}`).toEqual([]);
    } finally {
      await after.end();
    }
  });
});
