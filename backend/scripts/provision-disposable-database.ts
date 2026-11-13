/**
 * Aprovisionador administrativo (Sprint1 F0): rol migrator LOGIN sin superusuario,
 * marcador efímero por base y URLs separadas provision / migrate / runtime.
 * Sólo entornos dev|test|CI; nunca prod.
 */
import { randomUUID } from 'node:crypto';
import { appendFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import {
  assertMigratorBootstrapExpectation,
  assertNonProduction,
  loadSessionIdentity,
} from './guard.js';
import { assertSchemaAclParity, captureSchemaAclSnapshot } from './schema-acl-snapshot.js';
import { reconcileFabsoftOwnerAppObjectsToMigrator } from './reconcile-owner-to-migrator.js';
import { assignAuditWriteDefinerOwner } from './migrator-historical-elevation.js';
import { repairHistoricalMigrationGrants } from './historical-migration-grant-repair.js';
import {
  assertSameDatabaseInstallation,
  normalizeDatabaseUrl,
  parseDatabaseTarget,
  quoteIdent,
  redactDatabaseUrl,
} from './database-url.js';

const MIGRATOR_ROLE = 'fabsoft_migrator';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Hosts denegados explícitamente para seed (fail closed; no usar '-' ni lista vacía). */
const HARNESS_SEED_FORBIDDEN_HOSTS =
  'staging.example.com,staging.internal,.staging.example,supabase.co,db.supabase.co';

assertNonProduction();

const profile = process.argv[2] ?? 'ci-main';
const provisionUrl = process.env.DATABASE_PROVISION_URL?.trim();
if (!provisionUrl) throw new Error('DATABASE_PROVISION_URL (provisioner) requerido');
const provisionConnectionUrl = normalizeDatabaseUrl(provisionUrl);
const target = parseDatabaseTarget(provisionConnectionUrl);

const harnessRunId = process.env.FABSOFT_HARNESS_RUN_ID?.trim() || randomUUID();
const marker = process.env.SEED_EPHEMERAL_MARKER?.trim() || `ephemeral-${harnessRunId}`;

const migratorPassword =
  process.env.CI_MIGRATOR_PASSWORD?.trim() ||
  process.env.FABSOFT_MIGRATOR_PASSWORD?.trim() ||
  randomUUID();
const migratorTrustAuth =
  process.env.FABSOFT_MIGRATOR_TRUST === '1' || !process.env.CI_MIGRATOR_PASSWORD;

const createdDatabases: string[] = [];

function assertProvisionerSession(sessionUser: string): void {
  if (!['fabsoft_owner', 'postgres'].includes(sessionUser)) {
    throw new Error(`Provisioner inesperado: ${sessionUser}`);
  }
}

async function assertRoleAttributes(
  client: pg.Client,
  role: string,
  expected: { login?: boolean; createrole?: boolean; createdb?: boolean; super?: boolean },
): Promise<void> {
  const { rows } = await client.query<{
    rolsuper: boolean;
    rolcanlogin: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
  }>(`select rolsuper, rolcanlogin, rolcreaterole, rolcreatedb from pg_roles where rolname = $1`, [
    role,
  ]);
  if (rows.length === 0) return;
  const r = rows[0]!;
  if (expected.super !== undefined && r.rolsuper !== expected.super) {
    throw new Error(`Rol ${role} ya existe con rolsuper=${r.rolsuper} (rechazo harness)`);
  }
  if (expected.createrole !== undefined && r.rolcreaterole !== expected.createrole) {
    throw new Error(`Rol ${role} ya existe con rolcreaterole=${r.rolcreaterole} (rechazo harness)`);
  }
  if (expected.createdb !== undefined && r.rolcreatedb !== expected.createdb) {
    throw new Error(`Rol ${role} ya existe con rolcreatedb=${r.rolcreatedb} (rechazo harness)`);
  }
  if (expected.login !== undefined && r.rolcanlogin !== expected.login) {
    throw new Error(`Rol ${role} ya existe con rolcanlogin distinto (rechazo harness)`);
  }
}

const provision = new pg.Client({ connectionString: provisionConnectionUrl });
await provision.connect();
const provIdentity = await loadSessionIdentity((sql, params) => provision.query(sql, params));
assertProvisionerSession(provIdentity.sessionUser);

async function ensureMigratorRole(): Promise<void> {
  const { rows } = await provision.query<{ exists: boolean }>(
    `select exists(select 1 from pg_roles where rolname = $1) as exists`,
    [MIGRATOR_ROLE],
  );
  if (rows[0]?.exists) {
    await assertRoleAttributes(provision, MIGRATOR_ROLE, {
      super: false,
      createrole: false,
      createdb: false,
      login: true,
    });
    return;
  }
  await provision.query(
    `create role ${quoteIdent(MIGRATOR_ROLE)} login nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
  );
  const quoted = (
    await provision.query<{ q: string }>('select quote_literal($1) as q', [migratorPassword])
  ).rows[0]!.q;
  await provision.query(`alter role ${quoteIdent(MIGRATOR_ROLE)} password ${quoted}`);
}

async function installHarnessProvenance(dbName: string): Promise<void> {
  const dbClient = new pg.Client({
    connectionString: urlForDatabase(provisionConnectionUrl, dbName),
  });
  await dbClient.connect();
  try {
    const markerLit = (
      await dbClient.query<{ q: string }>('select quote_literal($1) as q', [marker])
    ).rows[0]!.q;
    const runLit = (
      await dbClient.query<{ q: string }>('select quote_literal($1) as q', [harnessRunId])
    ).rows[0]!.q;
    await dbClient.query(`create schema if not exists fabsoft_harness`);
    await dbClient.query(`
      create table if not exists fabsoft_harness.ephemeral_provenance (
        run_id text primary key,
        marker text not null,
        created_at timestamptz not null default now()
      )`);
    await dbClient.query(
      `delete from fabsoft_harness.ephemeral_provenance where run_id = ${runLit}`,
    );
    await dbClient.query(
      `insert into fabsoft_harness.ephemeral_provenance (run_id, marker) values (${runLit}, ${markerLit})`,
    );
    await dbClient.query(
      `alter database ${quoteIdent(dbName)} set fabsoft.seed_ephemeral = ${markerLit}`,
    );
  } finally {
    await dbClient.end();
  }
}

async function grantMigratorMigrationCatalogAccess(dbName: string): Promise<void> {
  const dbClient = new pg.Client({
    connectionString: urlForDatabase(provisionConnectionUrl, dbName),
  });
  await dbClient.connect();
  try {
    await dbClient.query(`grant usage on schema public to ${quoteIdent(MIGRATOR_ROLE)}`);
    await dbClient.query(
      `grant select on table public.schema_migrations to ${quoteIdent(MIGRATOR_ROLE)}`,
    );
    await dbClient.query(`grant usage on schema app to ${quoteIdent(MIGRATOR_ROLE)}`);
    await dbClient.query(
      `grant select on all tables in schema app to ${quoteIdent(MIGRATOR_ROLE)}`,
    );
  } finally {
    await dbClient.end();
  }
}

async function grantMigratorOnDatabase(dbName: string): Promise<void> {
  await provision.query(
    `grant connect, create, temporary on database ${quoteIdent(dbName)} to ${quoteIdent(MIGRATOR_ROLE)}`,
  );
  const dbClient = new pg.Client({
    connectionString: urlForDatabase(provisionConnectionUrl, dbName),
  });
  await dbClient.connect();
  try {
    await dbClient.query(`grant usage, create on schema public to ${quoteIdent(MIGRATOR_ROLE)}`);
    await dbClient.query(
      `grant select, insert, update, delete on all tables in schema public to ${quoteIdent(MIGRATOR_ROLE)}`,
    );
    await dbClient.query(`alter schema public owner to ${quoteIdent(MIGRATOR_ROLE)}`);
  } finally {
    await dbClient.end();
  }
  await installHarnessProvenance(dbName);
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

function urlForDatabase(base: string, dbName: string): string {
  const u = new URL(normalizeDatabaseUrl(base));
  u.pathname = `/${dbName}`;
  return u.toString();
}

async function runStagedMigrate(databaseUrl: string, dbName: string): Promise<void> {
  const mig = normalizeDatabaseUrl(databaseUrl);
  const prov = urlForDatabase(provisionConnectionUrl, dbName);
  assertSameDatabaseInstallation(mig, prov);
  const env = {
    ...process.env,
    DATABASE_MIGRATION_URL: mig,
    DATABASE_PROVISION_URL: prov,
  };
  const r = spawnSync('pnpm', ['exec', 'tsx', 'scripts/dbmate-staged-up.ts'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(
      `staged migrate falló (${redactDatabaseUrl(databaseUrl)}): ${r.stderr || r.stdout}`,
    );
  }
}

async function runDbmate(databaseUrl: string, migrationsDir: string): Promise<void> {
  const env = { ...process.env, DATABASE_MIGRATION_URL: normalizeDatabaseUrl(databaseUrl) };
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
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(databaseUrl) });
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

async function policySnapshot(databaseUrl: string): Promise<string> {
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(databaseUrl) });
  await c.connect();
  try {
    const { rows } = await c.query<{ inventory: string }>(
      `select coalesce(json_agg(row_to_json(t) order by schemaname, tablename, policyname)::text, '[]') as inventory
       from pg_policies t where schemaname = 'app'`,
    );
    return rows[0]?.inventory ?? '[]';
  } finally {
    await c.end();
  }
}

async function rlsSnapshot(databaseUrl: string): Promise<string> {
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(databaseUrl) });
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

async function assertNotForeignDeliveredDatabase(dbName: string): Promise<void> {
  const dbClient = new pg.Client({
    connectionString: urlForDatabase(provisionConnectionUrl, dbName),
  });
  await dbClient.connect();
  try {
    const { rows: reg } = await dbClient.query<{ r: string | null }>(
      `select to_regclass('fabsoft_harness.ephemeral_provenance')::text as r`,
    );
    if (!reg[0]?.r) return;
    const { rows } = await dbClient.query<{ run_id: string }>(
      `select run_id::text from fabsoft_harness.ephemeral_provenance`,
    );
    const foreign = rows.filter((r) => r.run_id !== harnessRunId);
    if (foreign.length > 0) {
      throw new Error(
        `Rechazo harness: base ${dbName} entregada con provenance ajena (${foreign.map((r) => r.run_id).join(',')})`,
      );
    }
  } finally {
    await dbClient.end();
  }
}

async function createHarnessDatabase(name: string): Promise<void> {
  const { rows } = await provision.query<{ exists: boolean }>(
    `select exists(select 1 from pg_database where datname = $1) as exists`,
    [name],
  );
  if (rows[0]?.exists) {
    throw new Error(`Rechazo harness: la base ${name} ya existe (sin DROP destructivo)`);
  }
  await provision.query(`create database ${quoteIdent(name)}`);
  createdDatabases.push(name);
  await grantMigratorOnDatabase(name);
}

async function expectedMigrationCount(): Promise<number> {
  const names = await readdir(join(ROOT, 'migrations'));
  return names.filter((n) => /^\d+_.+\.sql$/.test(n)).length;
}

async function revokeMigratorDatabaseCreate(dbName: string): Promise<void> {
  await provision.query(
    `revoke create on database ${quoteIdent(dbName)} from ${quoteIdent(MIGRATOR_ROLE)}`,
  );
}

async function assertMigratorAppDdlSmoke(migratorDatabaseUrl: string): Promise<void> {
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(migratorDatabaseUrl) });
  await c.connect();
  try {
    await c.query(`create table app.zz_f0_migrator_ddl_probe (id int primary key)`);
    await c.query(`alter table app.zz_f0_migrator_ddl_probe add column note text`);
    await c.query(
      `create or replace function app.zz_f0_fn_probe() returns int language sql as $$ select 1 $$`,
    );
    await c.query(`drop function app.zz_f0_fn_probe()`);
    await c.query(`drop table app.zz_f0_migrator_ddl_probe`);
  } finally {
    await c.end();
  }
}

async function assertAppTablesNotOwnedByBootstrap(migratorDatabaseUrl: string): Promise<void> {
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(migratorDatabaseUrl) });
  await c.connect();
  try {
    const { rows } = await c.query<{ tablename: string }>(
      `select c.relname as tablename
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'app' and c.relkind = 'r'
         and pg_catalog.pg_get_userbyid(c.relowner) = 'fabsoft_owner'`,
    );
    if (rows.length > 0) {
      throw new Error(
        `T-F0-10 upgrade: tablas app aún owner fabsoft_owner: ${rows.map((r) => r.tablename).join(',')}`,
      );
    }
  } finally {
    await c.end();
  }
}

async function applyDevelopMinimalData(databaseUrl: string): Promise<void> {
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(databaseUrl) });
  await c.connect();
  try {
    await c.query('begin');
    await c.query(
      `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
    );
    await c.query(
      `insert into app.products (id, name, product_type, status)
       values ('00000000-0000-0000-0000-0000000000f1', 'Harness QA', 'third_party', 'active')
       on conflict (id) do nothing`,
    );
    await c.query('commit');
  } finally {
    await c.end();
  }
}

async function profileDevelopHistoricalUpgrade(): Promise<void> {
  await ensureMigratorRole();
  const suffix = harnessRunId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const upgradeDb = `${target.database}_f0_${suffix}_develop`;
  const migCount = await expectedMigrationCount();
  await createHarnessDatabase(upgradeDb);
  try {
    const ownerUrl = urlForDatabase(provisionConnectionUrl, upgradeDb);
    const migUrl = migratorUrl(upgradeDb);
    await runDbmate(ownerUrl, join(ROOT, 'migrations'));
    {
      const owner = new pg.Client({ connectionString: ownerUrl });
      await owner.connect();
      try {
        await assignAuditWriteDefinerOwner((sql, params) => owner.query(sql, params));
        await repairHistoricalMigrationGrants((sql, params) => owner.query(sql, params));
      } finally {
        await owner.end();
      }
    }
    await grantMigratorMigrationCatalogAccess(upgradeDb);
    await applyDevelopMinimalData(ownerUrl);
    const preMigrator = await migrationInventory(migUrl);
    if (preMigrator.length !== migCount) {
      throw new Error(
        `develop upgrade: owner no aplicó ${migCount} migraciones (tiene ${preMigrator.length})`,
      );
    }
    const reassigned = await reconcileFabsoftOwnerAppObjectsToMigrator(ownerUrl, upgradeDb);
    await runStagedMigrate(migUrl, upgradeDb);
    const postMigrator = await migrationInventory(migUrl);
    if (postMigrator.length !== migCount) {
      throw new Error(`develop upgrade: inventario migrator inesperado ${postMigrator.length}`);
    }
    await assertAppTablesNotOwnedByBootstrap(migUrl);
    await assertMigratorAppDdlSmoke(migUrl);
    await revokeMigratorDatabaseCreate(upgradeDb);
    await rlsSnapshot(migUrl);
    if (process.env.FABSOFT_EXPECT_EVENT_TRIGGER === '1') {
      const etClient = new pg.Client({ connectionString: migUrl });
      await etClient.connect();
      try {
        const { rows: et } = await etClient.query<{ n: number }>(
          `select count(*)::int as n from pg_event_trigger where evtname = 'fabsoft_enforce_rls'`,
        );
        if (et[0]!.n !== 1) {
          throw new Error('develop-upgrade: falta event trigger fabsoft_enforce_rls');
        }
      } finally {
        await etClient.end();
      }
      const vitestRun = spawnSync(
        'pnpm',
        ['exec', 'vitest', 'run', '--config', 'vitest.f0-08b.mts'],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            DATABASE_MIGRATION_URL: migUrl,
            FABSOFT_EXPECT_EVENT_TRIGGER: '1',
            REQUIRE_DB_TESTS: '1',
          },
          encoding: 'utf8',
        },
      );
      const vitestOut = `${vitestRun.stdout}\n${vitestRun.stderr}`;
      console.log(vitestOut);
      if (vitestRun.status !== 0) {
        throw new Error(`develop-upgrade T-F0-08b vitest: ${vitestOut}`);
      }
    }
    console.log(
      JSON.stringify({
        profile: 'develop-historical-upgrade',
        harnessRunId,
        upgradeDb,
        migrations: postMigrator,
        reassignedObjects: reassigned,
        path: 'owner-full-chain-reassign-migrator-dbmate',
        assertRlsEverywhere: 'migrator',
        migratorDatabaseCreateRevoked: true,
      }),
    );
  } finally {
    for (const name of createdDatabases) {
      await provision.query(`drop database if exists ${quoteIdent(name)}`);
    }
    createdDatabases.length = 0;
  }
}

async function profileCiMain(): Promise<void> {
  await ensureMigratorRole();
  await assertNotForeignDeliveredDatabase(target.database);
  await grantMigratorOnDatabase(target.database);
  await installHarnessProvenance(target.database);
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
  assertMigratorBootstrapExpectation(identity);
  console.log(
    JSON.stringify({
      profile: 'ci-main',
      database: target.database,
      harnessRunId,
      migrator: {
        sessionUser: identity.sessionUser,
        currentUser: identity.currentUser,
        rolsuper: identity.rolsuper,
        rolbypassrls: identity.rolbypassrls,
        rolcanlogin: identity.rolcanlogin,
        rolcreaterole: identity.rolcreaterole,
        rolcreatedb: identity.rolcreatedb,
        memberOf: identity.memberOf,
        adminOf: identity.adminOf,
        canSetRoleOwner: identity.canSetRoleOwner,
      },
      provisioner: redactDatabaseUrl(provisionConnectionUrl),
      marker,
    }),
  );
  await writeGithubEnv({
    DATABASE_PROVISION_URL: provisionConnectionUrl,
    DATABASE_MIGRATION_URL: migUrl,
    TEST_DATABASE_MIGRATION_URL: migUrl,
    SEED_EPHEMERAL_MARKER: marker,
    SEED_HARNESS_RUN_ID: harnessRunId,
    SEED_ALLOWED_HOSTS: target.host,
    SEED_ALLOWED_DATABASES: target.database,
    SEED_ALLOWED_PORTS: target.port,
    SEED_ALLOW_RESET: '1',
    SEED_FORBIDDEN_HOSTS: HARNESS_SEED_FORBIDDEN_HOSTS,
  });
}

async function profileFoundationHarness(): Promise<void> {
  await ensureMigratorRole();
  const suffix = harnessRunId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const freshDb = `${target.database}_f0_${suffix}_fresh`;
  const upgradeDb = `${target.database}_f0_${suffix}_upg`;
  const migCount = await expectedMigrationCount();
  try {
    for (const name of [freshDb, upgradeDb]) {
      await createHarnessDatabase(name);
    }
    const freshUrl = migratorUrl(freshDb);
    const upgradeUrl = migratorUrl(upgradeDb);
    await runStagedMigrate(freshUrl, freshDb);
    const freshVersions = await migrationInventory(freshUrl);
    const freshRls = await rlsSnapshot(freshUrl);
    const freshPolicies = await policySnapshot(freshUrl);
    const freshAcl = await captureSchemaAclSnapshot(freshUrl);

    const ownerUpgradeUrl = urlForDatabase(provisionConnectionUrl, upgradeDb);
    await runDbmate(ownerUpgradeUrl, join(ROOT, 'migrations'));
    {
      const owner = new pg.Client({ connectionString: ownerUpgradeUrl });
      await owner.connect();
      try {
        await assignAuditWriteDefinerOwner((sql, params) => owner.query(sql, params));
        await repairHistoricalMigrationGrants((sql, params) => owner.query(sql, params));
      } finally {
        await owner.end();
      }
    }
    await grantMigratorMigrationCatalogAccess(upgradeDb);
    await applyDevelopMinimalData(ownerUpgradeUrl);
    const ownerVersions = await migrationInventory(ownerUpgradeUrl);
    if (ownerVersions.length !== migCount) {
      throw new Error(`upgrade histórico: owner aplicó ${ownerVersions.length}/${migCount}`);
    }
    const reassigned = await reconcileFabsoftOwnerAppObjectsToMigrator(ownerUpgradeUrl, upgradeDb);
    await runStagedMigrate(upgradeUrl, upgradeDb);
    const upgradeVersions = await migrationInventory(upgradeUrl);
    const upgradeRls = await rlsSnapshot(upgradeUrl);
    const upgradePolicies = await policySnapshot(upgradeUrl);
    const upgradeAcl = await captureSchemaAclSnapshot(upgradeUrl);

    if (freshVersions.length !== migCount || upgradeVersions.length !== migCount) {
      throw new Error(
        `Inventario de migraciones inesperado fresh=${freshVersions.length} upgrade=${upgradeVersions.length} esperado=${migCount}`,
      );
    }
    if (freshRls !== upgradeRls) {
      throw new Error('Inventario RLS fresh vs upgrade no coincide');
    }
    if (freshPolicies !== upgradePolicies) {
      throw new Error('Políticas RLS fresh vs upgrade no coinciden');
    }
    assertSchemaAclParity(freshAcl, upgradeAcl);
    await revokeMigratorDatabaseCreate(upgradeDb);
    console.log(
      JSON.stringify({
        profile: 'foundation-harness',
        harnessRunId,
        freshDb,
        upgradeDb,
        migrations: freshVersions,
        reassignedUpgradeObjects: reassigned,
        createdDatabases,
        migratorDatabaseCreateRevokedOnUpgrade: true,
      }),
    );
  } finally {
    for (const name of [...createdDatabases]) {
      await provision.query(`drop database if exists ${quoteIdent(name)}`);
    }
    createdDatabases.length = 0;
  }
}

switch (profile) {
  case 'ci-main':
    await profileCiMain();
    break;
  case 'foundation-harness':
    await profileFoundationHarness();
    break;
  case 'develop-historical-upgrade':
    await profileDevelopHistoricalUpgrade();
    break;
  default:
    throw new Error(`Perfil de aprovisionamiento desconocido: ${profile}`);
}

await provision.end();
