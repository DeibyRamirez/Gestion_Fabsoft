/**
 * Aplica migraciones con conexión directa fabsoft_migrator (LOGIN, sin superusuario).
 * El harness administrativo pre-crea membresías mínimas exigidas por 0003–0005 histórico.
 */
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import {
  assertSameDatabaseInstallation,
  normalizeDatabaseUrl,
  parseDatabaseTarget,
  quoteIdent,
  redactDatabaseUrl,
} from './database-url.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const migratorUrlRaw = process.env.DATABASE_MIGRATION_URL?.trim();
const provisionUrlRaw = process.env.DATABASE_PROVISION_URL?.trim();
if (!migratorUrlRaw) throw new Error('DATABASE_MIGRATION_URL no definido');
if (!provisionUrlRaw) throw new Error('DATABASE_PROVISION_URL no definido');
const migratorUrl = normalizeDatabaseUrl(migratorUrlRaw);
const provisionUrl = normalizeDatabaseUrl(provisionUrlRaw);
assertSameDatabaseInstallation(migratorUrl, provisionUrl);

async function listMigrationSqlFiles(): Promise<string[]> {
  const dir = join(ROOT, 'migrations');
  const names = await readdir(dir);
  const files = names.filter((n) => /^\d+_.+\.sql$/.test(n)).sort();
  if (files.length === 0) {
    throw new Error(`No hay migraciones en ${dir}`);
  }
  return files;
}

function runDbmate(databaseUrl: string, migrationsDir: string): void {
  const env = { ...process.env, DATABASE_MIGRATION_URL: databaseUrl };
  const dbmateBin = join(ROOT, 'node_modules', '.bin', 'dbmate');
  const r = spawnSync(
    dbmateBin,
    [
      '--env',
      'DATABASE_MIGRATION_URL',
      '--migrations-dir',
      migrationsDir,
      '--migrations-table',
      'public.schema_migrations',
      '--no-dump-schema',
      'up',
    ],
    { cwd: ROOT, env, encoding: 'utf8' },
  );
  if (r.status !== 0) {
    throw new Error(`dbmate up falló (${redactDatabaseUrl(databaseUrl)}): ${r.stderr || r.stdout}`);
  }
}

async function assertMigratorInventory(
  databaseUrl: string,
  expectedFiles: string[],
): Promise<void> {
  const target = parseDatabaseTarget(databaseUrl);
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect();
  try {
    const { rows } = await c.query<{ version: string }>(
      `select version from public.schema_migrations order by version`,
    );
    const applied = rows.map((r) => r.version);
    const expectedVersions = expectedFiles.map((f) => f.replace(/\.sql$/, ''));
    const missing = expectedVersions.filter((v) => !applied.includes(v));
    if (missing.length > 0) {
      throw new Error(
        `Inventario incompleto: faltan migraciones ${missing.join(',')} (aplicadas=${applied.join(',')})`,
      );
    }
    await c.query(`revoke create on database ${quoteIdent(target.database)} from fabsoft_app`);
    await c.query(`revoke create on database ${quoteIdent(target.database)} from fabsoft_worker`);
  } finally {
    await c.end();
  }
}

const migrationsDir = join(ROOT, 'migrations');
const migrationFiles = await listMigrationSqlFiles();
console.log(
  JSON.stringify({
    dbmateStaged: true,
    migrator: redactDatabaseUrl(migratorUrl),
    migrationCount: migrationFiles.length,
    migrations: migrationFiles,
  }),
);
runDbmate(migratorUrl, migrationsDir);
await assertMigratorInventory(migratorUrl, migrationFiles);
