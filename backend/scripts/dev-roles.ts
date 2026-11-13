/**
 * Sólo dev/test: habilita LOGIN de fabsoft_app, fabsoft_worker y fabsoft_bootstrap (las migraciones los crean NOLOGIN)
 * con las contraseñas de DATABASE_URL y WORKER_DATABASE_URL. Crea fabsoft_seed_writer (NO superusuario) para seed.
 */
import { appendFile } from 'node:fs/promises';
import pg from 'pg';
import { assertNonProduction, resolveGuardedDatabaseUrl } from './guard.js';
import { normalizeDatabaseUrl, parseDatabaseTarget, quoteIdent } from './database-url.js';

const SEED_WRITER = 'fabsoft_seed_writer';

assertNonProduction();
const { url: owner } = resolveGuardedDatabaseUrl(
  ['DATABASE_PROVISION_URL', 'DATABASE_MIGRATION_URL'],
  { allowUsers: ['fabsoft_owner', 'postgres', 'fabsoft_provisioner'] },
);
const client = new pg.Client({ connectionString: normalizeDatabaseUrl(owner) });
await client.connect();
try {
  for (const [role, envVar] of [
    ['fabsoft_app', 'DATABASE_URL'],
    ['fabsoft_worker', 'WORKER_DATABASE_URL'],
    ['fabsoft_bootstrap', 'BOOTSTRAP_DATABASE_URL'],
  ] as const) {
    const raw = process.env[envVar];
    if (!raw) continue;
    const url = new URL(normalizeDatabaseUrl(raw));
    if (decodeURIComponent(url.username || '') !== role)
      throw new Error(`${envVar} debe usar el rol ${role}`);
    const password = decodeURIComponent(url.password);
    const quoted = (await client.query<{ q: string }>('select quote_literal($1) as q', [password]))
      .rows[0]!.q;
    await client.query(`alter role ${quoteIdent(role)} login password ${quoted}`);
    console.log(`${role}: login habilitado`);
  }
  const target = parseDatabaseTarget(owner);
  const db = target.database;
  await client.query(`revoke create on database ${quoteIdent(db)} from fabsoft_app`);
  await client.query(`revoke create on database ${quoteIdent(db)} from fabsoft_worker`);

  const { rows: seedExists } = await client.query<{ exists: boolean }>(
    `select exists(select 1 from pg_roles where rolname = $1) as exists`,
    [SEED_WRITER],
  );
  if (!seedExists[0]?.exists) {
    await client.query(
      `create role ${quoteIdent(SEED_WRITER)} login nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
    );
  }
  await client.query(`grant usage on schema app to ${quoteIdent(SEED_WRITER)}`);
  await client.query(
    `grant select, insert, update on all tables in schema app to ${quoteIdent(SEED_WRITER)}`,
  );
  await client.query(`revoke delete on all tables in schema app from ${quoteIdent(SEED_WRITER)}`);
  await client.query(`revoke delete on app.audit_logs from ${quoteIdent(SEED_WRITER)}`);
  await client.query(
    `grant usage, select on all sequences in schema app to ${quoteIdent(SEED_WRITER)}`,
  );
  await client.query(`grant execute on all functions in schema app to ${quoteIdent(SEED_WRITER)}`);
  // fabsoft_bootstrap: sin DML masivo; EXECUTE sólo vía 0005 (bootstrap_first_admin).
  await client.query(`grant ${quoteIdent('fabsoft_app')} to ${quoteIdent(SEED_WRITER)}`);
  await client.query(`grant usage on schema fabsoft_harness to ${quoteIdent(SEED_WRITER)}`);
  await client.query(
    `grant select on table fabsoft_harness.ephemeral_provenance to ${quoteIdent(SEED_WRITER)}`,
  );

  const seedUrl = `postgres://${encodeURIComponent(SEED_WRITER)}@${target.host}:${target.port}/${encodeURIComponent(db)}?sslmode=disable`;
  const file = process.env.GITHUB_ENV;
  if (file) {
    await appendFile(file, `SEED_DATABASE_URL=${seedUrl}\nSEED_SESSION_ROLE=${SEED_WRITER}\n`);
  }
  console.log(`${SEED_WRITER}: listo para seed (sin superusuario)`);
} finally {
  await client.end();
}
