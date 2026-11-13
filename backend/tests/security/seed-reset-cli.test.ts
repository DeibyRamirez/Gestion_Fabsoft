/**
 * seed --reset: guard debe ejecutarse desde seed.ts (fail-closed).
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDatabaseTarget } from '../../scripts/database-url.js';

const backendRoot = fileURLToPath(new URL('../..', import.meta.url));
const seedUrl = process.env.SEED_DATABASE_URL;
const seedPort = seedUrl ? parseDatabaseTarget(seedUrl).port : '';

if (process.env.REQUIRE_DB_TESTS === '1' && !seedUrl) {
  throw new Error('seed-reset-cli: SEED_DATABASE_URL requerido');
}

describe('seed --reset CLI', () => {
  it('seed.ts invoca assertSeedResetProvisionerTarget antes de TRUNCATE', () => {
    const src = readFileSync(join(backendRoot, 'scripts/seed.ts'), 'utf8');
    const guardIdx = src.indexOf('assertSeedResetProvisionerTarget');
    const truncIdx = src.indexOf('truncate app.tasks');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(truncIdx).toBeGreaterThan(guardIdx);
  });

  it.skipIf(!seedUrl)('pnpm db:seed --reset sin procedencia harness sale ≠ 0', () => {
    const run = spawnSync(
      'pnpm',
      ['exec', 'tsx', 'scripts/seed.ts', '--reset'],
      {
        cwd: backendRoot,
        env: {
          ...process.env,
          APP_ENV: 'test',
          SEED_DATABASE_URL: seedUrl,
          SEED_ALLOWED_HOSTS: parseDatabaseTarget(seedUrl!).host,
          SEED_ALLOWED_PORTS: seedPort,
          SEED_ALLOWED_DATABASES: parseDatabaseTarget(seedUrl!).database,
          SEED_FORBIDDEN_HOSTS: 'prod.example.com',
          SEED_ALLOW_RESET: '1',
          SEED_SESSION_ROLE: 'fabsoft_seed_writer',
          SEED_EPHEMERAL_MARKER: 'marcador-invalido',
          SEED_HARNESS_RUN_ID: 'run-sin-provenance',
          DATABASE_PROVISION_URL: process.env.DATABASE_PROVISION_URL,
        },
        encoding: 'utf8',
      },
    );
    expect(run.status).not.toBe(0);
    expect(`${run.stderr}${run.stdout}`).toMatch(/procedencia|marcador|rechazado/i);
  });
});
