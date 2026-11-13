/**
 * seed --reset: fail-closed sin TRUNCATE cuando falta procedencia harness o provision apunta a otra BD.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll } from 'vitest';
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
const provUrl = process.env.DATABASE_PROVISION_URL;
const decoyDb = 'fabsoft_seed_reset_decoy';

if (process.env.REQUIRE_DB_TESTS === '1' && !seedUrl) {
  throw new Error('seed-reset-cli: SEED_DATABASE_URL o DATABASE_PROVISION_URL requerido');
}

describe('seed --reset CLI', () => {
  beforeAll(async () => {
    if (!provUrl) return;
    const owner = new pg.Client({ connectionString: provUrl });
    await owner.connect();
    try {
      const exists = await owner.query<{ ok: boolean }>(
        `select exists(select 1 from pg_database where datname = $1) as ok`,
        [decoyDb],
      );
      if (!exists.rows[0]!.ok) {
        await owner.query(`create database ${decoyDb}`);
      }
      const target = parseDatabaseTarget(provUrl);
      const decoyUrl = `postgres://${encodeURIComponent(target.user)}@${target.host}:${target.port}/${encodeURIComponent(decoyDb)}?sslmode=disable`;
      const decoy = new pg.Client({ connectionString: decoyUrl });
      await decoy.connect();
      try {
        await decoy.query(`create schema if not exists app`);
        await decoy.query(`create table if not exists app.tasks (
          id uuid primary key default gen_random_uuid(), title text)`);
        await decoy.query(`truncate app.tasks`);
        await decoy.query(`insert into app.tasks (title) values ('decoy-row')`);
      } finally {
        await decoy.end();
      }
    } finally {
      await owner.end();
    }
  });

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

  it.skipIf(!seedUrl || !provUrl || !process.env.SEED_EPHEMERAL_MARKER || !process.env.SEED_HARNESS_RUN_ID)(
    'rechaza reset con marcador válido si DATABASE_PROVISION_URL apunta a otra BD',
    async () => {
      const target = parseDatabaseTarget(provUrl!);
      const wrongProv = `postgres://${encodeURIComponent(target.user)}@${target.host}:${target.port}/${encodeURIComponent(decoyDb)}?sslmode=disable`;

      const countRows = async (url: string, table: 'seed' | 'decoy'): Promise<number> => {
        const client = new pg.Client({ connectionString: url });
        await client.connect();
        try {
          if (table === 'seed') {
            const { rows } = await client.query<{ n: number }>(
              `select count(*)::int as n from app.tasks`,
            );
            return rows[0]!.n;
          }
          const { rows } = await client.query<{ n: number }>(
            `select count(*)::int as n from app.tasks`,
          );
          return rows[0]!.n;
        } finally {
          await client.end();
        }
      };

      const beforeSeed = await countRows(seedUrl!, 'seed');
      const beforeDecoy = await countRows(wrongProv, 'decoy');

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
          SEED_EPHEMERAL_MARKER: process.env.SEED_EPHEMERAL_MARKER,
          SEED_HARNESS_RUN_ID: process.env.SEED_HARNESS_RUN_ID,
          DATABASE_PROVISION_URL: wrongProv,
        },
        encoding: 'utf8',
      });
      expect(run.status).not.toBe(0);
      expect(`${run.stderr}${run.stdout}`).toMatch(
        /provision|rechazado|distinto del seed|fail closed/i,
      );

      expect(await countRows(seedUrl!, 'seed')).toBe(beforeSeed);
      expect(await countRows(wrongProv, 'decoy')).toBe(beforeDecoy);
    },
  );

  it('seed.ts mantiene assertSeedResetProvisionerTarget antes de TRUNCATE', () => {
    const body = readFileSync(`${backendRoot}/scripts/seed.ts`, 'utf8');
    const guardAt = body.indexOf('assertSeedResetProvisionerTarget');
    const truncAt = body.indexOf('truncate app.integration_clients');
    expect(guardAt).toBeGreaterThan(-1);
    expect(truncAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(truncAt);
  });
});
