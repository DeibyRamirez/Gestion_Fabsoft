/**
 * Instala las tablas de pg-boss 12 como owner y las asigna a fabsoft_worker.
 * Se ejecuta una vez por base antes de arrancar el worker (el rol worker no tiene CREATE ON DATABASE).
 */
import pg from 'pg';
import { getConstructionPlans } from 'pg-boss';
import { normalizeDatabaseUrl, parseDatabaseTarget, quoteIdent } from './database-url.js';

const ownerUrl = process.env.DATABASE_PROVISION_URL ?? process.env.DATABASE_MIGRATION_URL;
if (!ownerUrl) throw new Error('DATABASE_PROVISION_URL es obligatoria para instalar pg-boss');

const client = new pg.Client({ connectionString: normalizeDatabaseUrl(ownerUrl) });
await client.connect();
try {
  const { rows } = await client.query<{ exists: boolean }>(
    `select to_regclass('pgboss.version') is not null as exists`,
  );
  if (!rows[0]?.exists) {
    await client.query(getConstructionPlans('pgboss'));
  }

  const target = parseDatabaseTarget(normalizeDatabaseUrl(ownerUrl));
  await client.query(`alter schema pgboss owner to fabsoft_worker`);

  const tables = await client.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'pgboss'`,
  );
  for (const { tablename } of tables.rows) {
    await client.query(`alter table pgboss.${quoteIdent(tablename)} owner to fabsoft_worker`);
  }

  const sequences = await client.query<{ sequencename: string }>(
    `select sequencename from pg_sequences where schemaname = 'pgboss'`,
  );
  for (const { sequencename } of sequences.rows) {
    await client.query(`alter sequence pgboss.${quoteIdent(sequencename)} owner to fabsoft_worker`);
  }

  const types = await client.query<{ typname: string }>(
    `select t.typname
       from pg_type t
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'pgboss' and t.typtype in ('e', 'd')`,
  );
  for (const { typname } of types.rows) {
    await client.query(`alter type pgboss.${quoteIdent(typname)} owner to fabsoft_worker`);
  }

  const functions = await client.query<{ proname: string; args: string }>(
    `select p.proname, pg_get_function_identity_arguments(p.oid) as args
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'pgboss' and p.prokind = 'f'`,
  );
  for (const { proname, args } of functions.rows) {
    await client.query(
      `alter function pgboss.${quoteIdent(proname)}(${args}) owner to fabsoft_worker`,
    );
  }

  await client.query(`grant usage on schema pgboss to fabsoft_app`);
  await client.query(
    `grant select, insert, update, delete on all tables in schema pgboss to fabsoft_app`,
  );
  await client.query(`grant usage, select on all sequences in schema pgboss to fabsoft_app`);
  await client.query(`grant execute on all functions in schema pgboss to fabsoft_app`);
  console.log(
    JSON.stringify({ msg: 'pgboss.installed', database: target.database, schema: 'pgboss' }),
  );
} finally {
  await client.end();
}
