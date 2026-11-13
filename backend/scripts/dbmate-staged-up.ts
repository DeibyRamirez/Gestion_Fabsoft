/**
 * Migraciones históricas 0001–0005:
 *   0001: fabsoft_migrator (LOGIN directo)
 *   0002–0005: fabsoft_migrator con elevación efímera (stub roles + membresías/CREATE temporales;
 *             sólo BD desechable). Provisioner ejecuta elevate/teardown, no dbmate.
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
import {
  assertEphemeralDatabase,
  assertMigratorElevationClosed,
  elevateMigratorForHistoricalMigrations,
  precreateStubRoles,
  repairMigratorSchemaPrivileges,
  revokeMigratorHistoricalElevation,
} from './migrator-historical-elevation.js';

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

async function reconcileMigratorOwnershipAndGrants(): Promise<void> {
  const provConn = provisionUrlForMigratorDb();
  const prov = new pg.Client({ connectionString: provConn });
  await prov.connect();
  try {
    const { rows: appNs } = await prov.query<{ owner: string | null }>(
      `select pg_catalog.pg_get_userbyid(nspowner)::text as owner
       from pg_catalog.pg_namespace where nspname = 'app'`,
    );
    const owner = appNs[0]?.owner;
    if (!owner) return;
    if (owner !== MIGRATOR) {
      await prov.query(`alter schema app owner to ${quoteIdent(MIGRATOR)}`);
      console.log(JSON.stringify({ reconcileAppSchemaForUpgrade: true, previousOwner: owner }));
    }
    await prov.query(`grant all on schema app to ${quoteIdent(MIGRATOR)} with grant option`);
    await prov.query(
      `grant select, insert, update, delete on all tables in schema app to ${quoteIdent(MIGRATOR)}`,
    );
    await prov.query(
      `grant usage, select on all sequences in schema app to ${quoteIdent(MIGRATOR)}`,
    );
    await prov.query(`grant execute on all functions in schema app to ${quoteIdent(MIGRATOR)}`);
    await prov.query(`grant usage on schema public to ${quoteIdent(MIGRATOR)}`);
    await prov.query(`grant select on table public.schema_migrations to ${quoteIdent(MIGRATOR)}`);
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

async function assertInventory(
  migratorUrl: string,
  provisionUrl: string,
  expectedFiles: string[],
): Promise<void> {
  const target = parseDatabaseTarget(migratorUrl);
  const c = new pg.Client({ connectionString: migratorUrl });
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
  } finally {
    await c.end();
  }
  const prov = new pg.Client({ connectionString: provisionUrl });
  await prov.connect();
  try {
    await prov.query(`revoke create on database ${quoteIdent(target.database)} from fabsoft_app`);
    await prov.query(
      `revoke create on database ${quoteIdent(target.database)} from fabsoft_worker`,
    );
  } finally {
    await prov.end();
  }
}

function splitHistorical(files: string[]): {
  migrator: string[];
  provisioner: string[];
  future: string[];
} {
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
console.log(JSON.stringify({ pendingMigrations: pending.length, versions: pending }));
await reconcileMigratorOwnershipAndGrants();

const tmpBase = await mkdtemp(join(tmpdir(), 'fabsoft-mig-stage-'));
try {
  if (migrator.length > 0) {
    const dir1 = join(tmpBase, 'migrator');
    await copyFiles(migrator, dir1);
    runDbmate(migratorUrl, dir1);
  }
  if (provisioner.length > 0) {
    const pendingHistorical = await pendingMigrationVersions(migratorUrl, provisioner);
    if (pendingHistorical.length > 0) {
      const dbName = parseDatabaseTarget(migratorUrl).database;
      const ownerConn = provisionUrlForMigratorDb();
      const owner = new pg.Client({ connectionString: ownerConn });
      await owner.connect();
      try {
        const q = (sql: string, params?: unknown[]) => owner.query(sql, params);
        await assertEphemeralDatabase(q);
        await precreateStubRoles(q);
        await elevateMigratorForHistoricalMigrations(q, dbName);
        try {
          for (const f of provisioner) {
            const still = await pendingMigrationVersions(migratorUrl, [f]);
            if (still.length === 0) continue;
            await repairMigratorSchemaPrivileges(q);
            const dirOne = join(tmpBase, `provisioner-${f.replace(/\.sql$/, '')}`);
            await mkdir(dirOne, { recursive: true });
            await copyFiles([f], dirOne);
            runDbmate(migratorUrl, dirOne);
          }
        } finally {
          await revokeMigratorHistoricalElevation(q, dbName);
          await repairMigratorSchemaPrivileges(q);
          await assertMigratorElevationClosed(q);
        }
      } finally {
        await owner.end();
      }
    }
  }
  if (future.length > 0) {
    const dirF = join(tmpBase, 'future');
    await copyFiles(future, dirF);
    runDbmate(migratorUrl, dirF);
  }
} finally {
  await rm(tmpBase, { recursive: true, force: true });
}

await assertInventory(migratorUrl, provisionUrlForMigratorDb(), migrationFiles);
