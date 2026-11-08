/**
 * Aplica migraciones con conexión directa fabsoft_migrator (LOGIN, sin superusuario).
 * Si hay pendientes tras un upgrade histórico (esquema app propiedad del owner), el
 * provisioner reconcilia ownership mínimo antes de dbmate.
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
const MIGRATOR = 'fabsoft_migrator';

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

async function pendingMigrationVersions(
  databaseUrl: string,
  expectedFiles: readonly string[],
): Promise<string[]> {
  const expected = expectedFiles.map((f) => f.replace(/\.sql$/, ''));
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect();
  try {
    const { rows } = await c.query<{ version: string }>(
      `select version from public.schema_migrations`,
    );
    const applied = new Set(rows.map((r) => r.version));
    return expected.filter((v) => !applied.has(v));
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') return [...expected];
    throw err;
  } finally {
    await c.end();
  }
}

async function reconcileOwnerSchemaForPending(
  provisionConn: string,
  migratorConn: string,
  pending: string[],
): Promise<void> {
  if (pending.length === 0) return;
  const prov = new pg.Client({ connectionString: provisionConn });
  await prov.connect();
  try {
    const { rows } = await prov.query<{ owner: string | null }>(
      `select pg_catalog.pg_get_userbyid(nspowner)::text as owner
       from pg_catalog.pg_namespace where nspname = 'app'`,
    );
    const owner = rows[0]?.owner;
    if (!owner || owner === MIGRATOR) return;
    await prov.query(`alter schema app owner to ${quoteIdent(MIGRATOR)}`);
    await prov.query(`grant all on schema app to ${quoteIdent(MIGRATOR)} with grant option`);
    console.log(JSON.stringify({ reconcileAppSchemaForUpgrade: true, previousOwner: owner }));
  } finally {
    await prov.end();
  }
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
const provDbUrl = (() => {
  const u = new URL(provisionUrl);
  u.pathname = new URL(migratorUrl).pathname;
  return u.toString();
})();
const pending = await pendingMigrationVersions(migratorUrl, migrationFiles);
await reconcileOwnerSchemaForPending(provDbUrl, migratorUrl, pending);
runDbmate(migratorUrl, migrationsDir);
await assertMigratorInventory(migratorUrl, migrationFiles);
