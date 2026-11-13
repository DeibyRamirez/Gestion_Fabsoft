/**
 * seed --reset: fail-closed sin TRUNCATE cuando falta procedencia harness.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { parseDatabaseTarget } from '../../scripts/database-url.js';

const backendRoot = fileURLToPath(new URL('../..', import.meta.url));

function resolveSeedWriterUrl(): string | undefined {
  const raw = process.env.SEED_DATABASE_URL?.trim();
  if (raw && parseDatabaseTarget(raw).user === 'fabsoft_seed_writer') return raw;
  const prov = process.env.DATABASE_PROVISION_URL?.trim();
  if (!prov) return undefined;
  const t = parseDatabaseTarget(prov);
  return `postgres://fabsoft_seed_writer@${t.host}:${t.port}/${encodeURIComponent(t.database)}?sslmode=disable`;
}

const seedUrl = resolveSeedWriterUrl();
const seedPort = seedUrl ? parseDatabaseTarget(seedUrl).port : '';

if (process.env.REQUIRE_DB_TESTS === '1' && !seedUrl) {
  throw new Error('seed-reset-cli: SEED_DATABASE_URL o DATABASE_PROVISION_URL requerido');
}

describe('seed --reset CLI', () => {
  it.skipIf(!seedUrl)('rechaza reset inválido y no TRUNCATE app.tasks', async () => {
    const client = new pg.Client({ connectionString: seedUrl! });
    await client.connect();
    let before = 0;
    try {
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from app.tasks`,
      );
      before = rows[0]!.n;
    } finally {
      await client.end();
    }

    const run = spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed.ts', '--reset'], {
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
    });
    expect(run.status).not.toBe(0);
    expect(`${run.stderr}${run.stdout}`).toMatch(/procedencia|marcador|rechazado|no permitido|no coincide/i);

    const afterClient = new pg.Client({ connectionString: seedUrl! });
    await afterClient.connect();
    try {
      const { rows } = await afterClient.query<{ n: number }>(
        `select count(*)::int as n from app.tasks`,
      );
      expect(rows[0]!.n).toBe(before);
    } finally {
      await afterClient.end();
    }
  });
});
