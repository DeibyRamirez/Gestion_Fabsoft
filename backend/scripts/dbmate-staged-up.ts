/**
 * Aplica 0001, reconcilia propiedad de `app` para migrator no-superusuario, luego 0002–0005.
 * Sin tocar el historial SQL (Sprint1 F0).
 */
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { parseDatabaseTarget, quoteIdent, redactDatabaseUrl } from './database-url.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATOR = 'fabsoft_migrator';

const migratorUrlRaw = process.env.DATABASE_MIGRATION_URL?.trim();
const provisionUrlRaw = process.env.DATABASE_PROVISION_URL?.trim();
if (!migratorUrlRaw) throw new Error('DATABASE_MIGRATION_URL no definido');
if (!provisionUrlRaw) throw new Error('DATABASE_PROVISION_URL no definido');
const migratorUrl: string = migratorUrlRaw;
const provisionUrl: string = provisionUrlRaw;

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

function urlForDatabase(base: string, dbName: string): string {
  const u = new URL(base);
  u.pathname = `/${dbName}`;
  return u.toString();
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
    await prov.query(`grant all on all tables in schema app to ${quoteIdent(MIGRATOR)}`);
    await prov.query(`grant all on all sequences in schema app to ${quoteIdent(MIGRATOR)}`);
    await prov.query(`grant all on all functions in schema app to ${quoteIdent(MIGRATOR)}`);
    console.log(
      JSON.stringify({ reconcileAppSchema: true, previousOwner: rows[0]!.owner, owner: MIGRATOR }),
    );
  } finally {
    await prov.end();
  }
}

const partialDir = await mkdtemp(join(tmpdir(), 'fabsoft-mig-0001-'));
await cp(join(ROOT, 'migrations', '0001_schema.sql'), join(partialDir, '0001_schema.sql'));
try {
  runDbmate(migratorUrl, partialDir);
  await reconcileAppSchema();
  runDbmate(migratorUrl, join(ROOT, 'migrations'));
} finally {
  await rm(partialDir, { recursive: true, force: true });
}
