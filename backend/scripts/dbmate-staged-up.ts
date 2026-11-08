/**
 * Migraciones históricas 0001–0005:
 *   0001: fabsoft_migrator (LOGIN directo)
 *   0002–0005: provisioner (CREATE ROLE / ALTER OWNER en SQL congelado; sin SET ROLE desde migrator)
 * Migraciones nuevas (0006+): sólo migrator (lista dinámica).
 */
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
/** Límite del historial congelado acordado (no ampliar sin revisión seguridad). */
const HISTORICAL_MIGRATOR_MAX = '0001_schema.sql';

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
  if (files.length === 0) throw new Error(`No hay migraciones en ${dir}`);
  return files;
}

function provisionUrlForMigratorDb(): string {
  const u = new URL(provisionUrl);
  u.pathname = new URL(migratorUrl).pathname;
  return u.toString();
}

async function pendingMigrationVersions(
  databaseUrl: string,
  expectedFiles: readonly string[],
): Promise<string[]> {
  const expected = expectedFiles.map((f) => f.replace(/\.sql$/, '').split('_')[0]!);
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect();
  try {
    const { rows } = await c.query<{ version: string }>(
      `select version from public.schema_migrations`,
    );
    const applied = new Set(rows.map((r) => r.version));
    return expected.filter((v) => !applied.has(v));
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '42P01') return [...expected];
    throw err;
  } finally {
    await c.end();
  }
}

async function reconcileOwnerSchemaForPending(pending: string[]): Promise<void> {
  if (pending.length === 0) return;
  const provConn = provisionUrlForMigratorDb();
  const prov = new pg.Client({ connectionString: provConn });
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

async function assertInventory(databaseUrl: string, expectedFiles: string[]): Promise<void> {
  const target = parseDatabaseTarget(databaseUrl);
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect();
  try {
    const { rows } = await c.query<{ version: string }>(
      `select version from public.schema_migrations order by version`,
    );
    const applied = rows.map((r) => r.version);
    const expectedVersions = expectedFiles.map((f) => f.replace(/\.sql$/, '').split('_')[0]!);
    const missing = expectedVersions.filter((v) => !applied.includes(v));
    if (missing.length > 0) {
      throw new Error(
        `Inventario incompleto: faltan ${missing.join(',')} (aplicadas=${applied.join(',')})`,
      );
    }
    await c.query(`revoke create on database ${quoteIdent(target.database)} from fabsoft_app`);
    await c.query(`revoke create on database ${quoteIdent(target.database)} from fabsoft_worker`);
  } finally {
    await c.end();
  }
}

function splitHistorical(files: string[]): { migrator: string[]; provisioner: string[]; future: string[] } {
  const migrator: string[] = [];
  const provisioner: string[] = [];
  const future: string[] = [];
  for (const f of files) {
    const n = Number.parseInt(f.slice(0, 4), 10);
    if (f <= HISTORICAL_MIGRATOR_MAX) {
      migrator.push(f);
    } else if (n >= 2 && n <= 5) {
      provisioner.push(f);
    } else if (n > 5) {
      future.push(f);
    } else {
      provisioner.push(f);
    }
  }
  return { migrator, provisioner, future };
}

async function copyFiles(files: string[], into: string): Promise<void> {
  await mkdir(into, { recursive: true });
  for (const f of files) {
    await copyFile(join(ROOT, 'migrations', f), join(into, f));
  }
}

const migrationFiles = await listMigrationSqlFiles();
const { migrator, provisioner, future } = splitHistorical(migrationFiles);

if (future.length > 0 && !process.env.FABSOFT_ALLOW_FUTURE_MIGRATOR) {
  console.log(
    JSON.stringify({
      warnFutureMigrations: true,
      files: future,
      hint: 'Defina FABSOFT_ALLOW_FUTURE_MIGRATOR=1 cuando existan 0006+',
    }),
  );
}

console.log(
  JSON.stringify({
    dbmateStaged: true,
    migrator: redactDatabaseUrl(migratorUrl),
    historicalSplit: { migrator, provisioner, future },
    migrationCount: migrationFiles.length,
  }),
);

const pending = await pendingMigrationVersions(migratorUrl, migrationFiles);
await reconcileOwnerSchemaForPending(pending);

const tmpBase = await mkdtemp(join(tmpdir(), 'fabsoft-mig-stage-'));
try {
  if (migrator.length > 0) {
    const dir1 = join(tmpBase, 'migrator');
    await copyFiles(migrator, dir1);
    runDbmate(migratorUrl, dir1);
  }
  if (provisioner.length > 0) {
    const dirP = join(tmpBase, 'provisioner');
    await copyFiles(provisioner, dirP);
    runDbmate(provisionUrlForMigratorDb(), dirP);
  }
  if (future.length > 0) {
    const dirF = join(tmpBase, 'future');
    await copyFiles(future, dirF);
    runDbmate(migratorUrl, dirF);
  }
} finally {
  await rm(tmpBase, { recursive: true, force: true });
}

await assertInventory(migratorUrl, migrationFiles);
