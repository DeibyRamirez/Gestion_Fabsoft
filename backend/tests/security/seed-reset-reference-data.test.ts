/**
 * seed --reset conserva alert_rules y app_settings (T-F0-09c contact_channel).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { parseDatabaseTarget } from '../../scripts/database-url.js';

const backendRoot = fileURLToPath(new URL('../..', import.meta.url));
const seedUrl = process.env.SEED_DATABASE_URL;
const provUrl = process.env.DATABASE_PROVISION_URL;

describe.skipIf(
  !seedUrl || !provUrl || !process.env.SEED_EPHEMERAL_MARKER || !process.env.SEED_HARNESS_RUN_ID,
)('seed --reset datos de referencia', () => {
  it('tras --reset, app_settings y alert_rules siguen presentes (T-F0-09c)', async () => {
    const t = parseDatabaseTarget(seedUrl!);
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
    const client = new pg.Client({ connectionString: seedUrl });
    await client.connect();
    try {
      const rules = await client.query<{ n: number }>(
        `select count(*)::int as n from app.alert_rules`,
      );
      expect(rules.rows[0]!.n).toBeGreaterThanOrEqual(6);
      const settings = await client.query<{ key: string }>(
        `select key from app.app_settings where key = 'contact_channel'`,
      );
      expect(settings.rowCount).toBe(1);
    } finally {
      await client.end();
    }
  });
});
