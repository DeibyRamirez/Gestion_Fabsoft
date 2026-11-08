/**
 * Aplica migraciones 0001–0005 sin reescribir SQL histórico:
 *   0001–0002: conexión directa fabsoft_migrator (LOGIN, no superusuario)
 *   0003–0005: conexión directa provisioner (requiere ALTER/OWNER sobre pgboss y
 *              SECURITY DEFINER; el historial asumía rol propietario con capacidad SET ROLE)
 *
 * Ver docs/deployment-f0.md (limitación documentada).
 */
import { mkdtemp, cp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { parseDatabaseTarget, quoteIdent, redactDatabaseUrl } from './database-url.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATOR = 'fabsoft_migrator';
const MIGRATION_FILES = [
  '0001_schema.sql',
  '0002_rls.sql',
  '0003_security_hardening.sql',
  '0004_integration_views.sql',
  '0005_auth_security_definer.sql',
] as const;

const migratorUrlRaw = process.env.DATABASE_MIGRATION_URL?.trim();
const provisionUrlRaw = process.env.DATABASE_PROVISION_URL?.trim();
if (!migratorUrlRaw) throw new Error('DATABASE_MIGRATION_URL no definido');
if (!provisionUrlRaw) throw new Error('DATABASE_PROVISION_URL no definido');
const migratorUrl: string = migratorUrlRaw;
const provisionUrl: string = provisionUrlRaw;

function urlForDatabase(base: string, dbName: string): string {
  const u = new URL(base);
  u.pathname = `/${dbName}`;
  return u.toString();
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

async function reconcileAppSchema(): Promise<void> {
  const target = parseDatabaseTarget(migratorUrl);
  const prov = new pg.Client({ connectionString: urlForDatabase(provisionUrl, target.database) });
  await prov.connect();
  try {
    const { rows } = await prov.query<{ owner: string }>(
      `select pg_catalog.pg_get_userbyid(n.nspowner)::text as owner
       from pg_catalog.pg_namespace n where n.nspname = 'app'`,
    );
    if (rows.length === 0) return;
    await prov.query(`alter schema app owner to ${quoteIdent(MIGRATOR)}`);
    await prov.query(`grant all on schema app to ${quoteIdent(MIGRATOR)} with grant option`);
    await prov.query(`grant create, usage on schema app to ${quoteIdent(MIGRATOR)}`);
    console.log(
      JSON.stringify({ reconcileAppSchema: true, previousOwner: rows[0]!.owner, owner: MIGRATOR }),
    );
  } finally {
    await prov.end();
  }
}

async function copyMigrations(into: string, files: readonly string[]): Promise<void> {
  for (const file of files) {
    await cp(join(ROOT, 'migrations', file), join(into, file));
  }
}

const tmpBase = await mkdtemp(join(tmpdir(), 'fabsoft-mig-stage-'));
const dir12 = join(tmpBase, '0001-0002');
const dir345 = join(tmpBase, '0003-0005');
await mkdir(dir12, { recursive: true });
await mkdir(dir345, { recursive: true });
try {
  await copyMigrations(dir12, MIGRATION_FILES.slice(0, 2));
  runDbmate(migratorUrl, dir12);
  await reconcileAppSchema();
  await copyMigrations(dir345, MIGRATION_FILES.slice(2));
  runDbmate(provisionUrl, dir345);
  const target = parseDatabaseTarget(provisionUrl);
  const prov = new pg.Client({ connectionString: urlForDatabase(provisionUrl, target.database) });
  await prov.connect();
  try {
    await prov.query(`revoke create on database ${quoteIdent(target.database)} from fabsoft_app`);
    await prov.query(
      `revoke create on database ${quoteIdent(target.database)} from fabsoft_worker`,
    );
  } finally {
    await prov.end();
  }
} finally {
  await rm(tmpBase, { recursive: true, force: true });
}
