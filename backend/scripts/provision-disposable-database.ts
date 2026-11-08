/**
 * Aprovisionador administrativo (Sprint1 F0): rol migrator LOGIN sin superusuario,
 * marcador efímero por base y URLs separadas provision / migrate / runtime.
 * Sólo entornos dev|test|staging|CI; nunca prod.
 */
import { randomUUID } from 'node:crypto';
import { mkdtemp, cp, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { assertNonProduction, loadSessionIdentity } from './guard.js';
import { parseDatabaseTarget, quoteIdent, redactDatabaseUrl } from './database-url.js';

const MIGRATOR_ROLE = 'fabsoft_migrator';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

assertNonProduction();

const profile = process.argv[2] ?? 'ci-main';
const provisionUrl = (process.env.DATABASE_PROVISION_URL?.trim() ||
  process.env.DATABASE_MIGRATION_URL?.trim()) as string | undefined;
if (!provisionUrl)
  throw new Error('DATABASE_PROVISION_URL o DATABASE_MIGRATION_URL (provisioner) requerido');
const provisionConnectionUrl: string = provisionUrl;

const migratorPassword =
  process.env.CI_MIGRATOR_PASSWORD?.trim() ||
  process.env.FABSOFT_MIGRATOR_PASSWORD?.trim() ||
  randomUUID();
const migratorTrustAuth =
  process.env.FABSOFT_MIGRATOR_TRUST === '1' || !process.env.CI_MIGRATOR_PASSWORD;

const marker = process.env.SEED_EPHEMERAL_MARKER?.trim() || `ephemeral-${randomUUID()}`;
const target = parseDatabaseTarget(provisionConnectionUrl);

const provision = new pg.Client({ connectionString: provisionConnectionUrl });
await provision.connect();

/**
 * Roles referenciados con AUTHORIZATION / SECURITY DEFINER en 0001–0005 deben existir y
 * el migrator debe ser miembro (SET ROLE) antes de ejecutar el historial sin reescritura.
 */
async function bootstrapRoleStubsForMigrator(): Promise<void> {
  await provision.query(`
    do $do$
    begin
      if not exists (select 1 from pg_roles where rolname = 'fabsoft_app') then
        create role fabsoft_app nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'fabsoft_worker') then
        create role fabsoft_worker nologin nosuperuser nocreatedb nocreaterole inherit nobypassrls;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'fabsoft_secure_view') then
        create role fabsoft_secure_view nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'fabsoft_auth_definer') then
        create role fabsoft_auth_definer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'fabsoft_bootstrap') then
        create role fabsoft_bootstrap nologin nosuperuser nocreatedb nocreaterole inherit nobypassrls;
      end if;
    end
    $do$`);
  for (const role of [
    'fabsoft_app',
    'fabsoft_worker',
    'fabsoft_secure_view',
    'fabsoft_auth_definer',
    'fabsoft_bootstrap',
  ]) {
    await provision.query(`grant ${quoteIdent(role)} to ${quoteIdent(MIGRATOR_ROLE)}`);
  }
}

async function ensureMigratorRole(): Promise<void> {
  const { rows } = await provision.query<{ exists: boolean }>(
    `select exists(select 1 from pg_roles where rolname = $1) as exists`,
    [MIGRATOR_ROLE],
  );
  if (!rows[0]?.exists) {
    await provision.query(
      `create role ${quoteIdent(MIGRATOR_ROLE)} login nosuperuser nocreatedb nobypassrls createrole inherit`,
    );
  }
  const quoted = (
    await provision.query<{ q: string }>('select quote_literal($1) as q', [migratorPassword])
  ).rows[0]!.q;
  await provision.query(`alter role ${quoteIdent(MIGRATOR_ROLE)} login password ${quoted}`);
}

async function grantMigratorOnDatabase(dbName: string): Promise<void> {
  await provision.query(
    `alter database ${quoteIdent(dbName)} owner to ${quoteIdent(MIGRATOR_ROLE)}`,
  );
  await provision.query(
    `alter database ${quoteIdent(dbName)} set fabsoft.seed_ephemeral = ${(await provision.query<{ q: string }>('select quote_literal($1) as q', [marker])).rows[0]!.q}`,
  );
}

function migratorUrl(dbName: string, host = target.host, port = target.port): string {
  const encUser = encodeURIComponent(MIGRATOR_ROLE);
  if (migratorTrustAuth) {
    return `postgres://${encUser}@${host}:${port}/${dbName}?sslmode=disable`;
  }
  const encPass = encodeURIComponent(migratorPassword);
  return `postgres://${encUser}:${encPass}@${host}:${port}/${dbName}?sslmode=disable`;
}

async function writeGithubEnv(lines: Record<string, string>): Promise<void> {
  const file = process.env.GITHUB_ENV;
  if (!file) return;
  const body = Object.entries(lines)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  await appendFile(file, `${body}\n`);
}

async function runDbmate(databaseUrl: string, migrationsDir: string): Promise<void> {
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

async function migrationInventory(databaseUrl: string): Promise<string[]> {
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect();
  try {
    const { rows } = await c.query<{ version: string }>(
      `select version from public.schema_migrations order by version`,
    );
    return rows.map((r) => r.version);
  } finally {
    await c.end();
  }
}

async function rlsSnapshot(databaseUrl: string): Promise<string> {
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect();
  try {
    const { rows } = await c.query<{ inventory: string }>(
      `select coalesce(json_agg(row_to_json(t) order by table_name)::text, '[]') as inventory
       from app.rls_inventory() t`,
    );
    await c.query('select app.assert_rls_everywhere()');
    return rows[0]?.inventory ?? '[]';
  } finally {
    await c.end();
  }
}

async function profileCiMain(): Promise<void> {
  await ensureMigratorRole();
  await bootstrapRoleStubsForMigrator();
  await grantMigratorOnDatabase(target.database);
  const migUrl = migratorUrl(target.database);
  const identity = await (async () => {
    const c = new pg.Client({ connectionString: migUrl });
    await c.connect();
    try {
      return await loadSessionIdentity((sql, params) => c.query(sql, params));
    } finally {
      await c.end();
    }
  })();
  console.log(
    JSON.stringify({
      profile: 'ci-main',
      database: target.database,
      migrator: {
        sessionUser: identity.sessionUser,
        rolsuper: identity.rolsuper,
        rolbypassrls: identity.rolbypassrls,
        rolcanlogin: identity.rolcanlogin,
        canSetRoleOwner: identity.canSetRoleOwner,
      },
      provisioner: redactDatabaseUrl(provisionConnectionUrl),
      marker,
    }),
  );
  await writeGithubEnv({
    DATABASE_PROVISION_URL: provisionConnectionUrl,
    DATABASE_MIGRATION_URL: migUrl,
    TEST_DATABASE_MIGRATION_URL: provisionConnectionUrl,
    SEED_DATABASE_URL: provisionConnectionUrl,
    SEED_EPHEMERAL_MARKER: marker,
    SEED_ALLOWED_HOSTS: target.host,
    SEED_ALLOWED_DATABASES: target.database,
    SEED_ALLOWED_PORTS: target.port,
    SEED_ALLOW_RESET: '1',
  });
}

async function profileFoundationHarness(): Promise<void> {
  await ensureMigratorRole();
  await bootstrapRoleStubsForMigrator();
  const freshDb = `${target.database}_f0_fresh`;
  const upgradeDb = `${target.database}_f0_upg`;
  for (const name of [freshDb, upgradeDb]) {
    await provision.query(`drop database if exists ${quoteIdent(name)}`);
    await provision.query(`create database ${quoteIdent(name)}`);
    await grantMigratorOnDatabase(name);
  }
  const freshUrl = migratorUrl(freshDb);
  const upgradeUrl = migratorUrl(upgradeDb);
  const migrations = join(ROOT, 'migrations');
  await runDbmate(freshUrl, migrations);
  const freshVersions = await migrationInventory(freshUrl);
  const freshRls = await rlsSnapshot(freshUrl);

  const partialDir = await mkdtemp(join(tmpdir(), 'fabsoft-mig-'));
  await cp(join(migrations, '0001_schema.sql'), join(partialDir, '0001_schema.sql'));
  await runDbmate(upgradeUrl, partialDir);
  const partialVersions = await migrationInventory(upgradeUrl);
  const only0001 = partialVersions.length === 1 && partialVersions[0]!.startsWith('0001');
  if (!only0001) {
    throw new Error(
      `fixture upgrade: se esperaba solo 0001 aplicada, obtuvo ${partialVersions.join(',')}`,
    );
  }
  await runDbmate(upgradeUrl, migrations);
  const upgradeVersions = await migrationInventory(upgradeUrl);
  const upgradeRls = await rlsSnapshot(upgradeUrl);

  if (freshVersions.length !== 5 || upgradeVersions.length !== 5) {
    throw new Error(
      `Inventario de migraciones inesperado fresh=${freshVersions.length} upgrade=${upgradeVersions.length}`,
    );
  }
  if (freshRls !== upgradeRls) {
    throw new Error('Inventario RLS fresh vs upgrade no coincide');
  }
  await rm(partialDir, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      profile: 'foundation-harness',
      freshDb,
      upgradeDb,
      migrations: freshVersions,
    }),
  );
}

switch (profile) {
  case 'ci-main':
    await profileCiMain();
    break;
  case 'foundation-harness':
    await profileFoundationHarness();
    break;
  default:
    throw new Error(`Perfil de aprovisionamiento desconocido: ${profile}`);
}

await provision.end();
