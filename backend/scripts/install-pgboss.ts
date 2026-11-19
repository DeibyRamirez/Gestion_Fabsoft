/**
 * Instala las tablas de pg-boss 9 como owner y las asigna a fabsoft_worker.
 * Se ejecuta una vez por base antes de arrancar el worker (el rol worker no tiene CREATE ON DATABASE).
 */
import pg from 'pg';
import PgBoss from 'pg-boss';
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
    await client.query(PgBoss.getConstructionPlans('pgboss'));
  }

  const target = parseDatabaseTarget(normalizeDatabaseUrl(ownerUrl));
  await client.query(`alter schema pgboss owner to fabsoft_worker`);
  for (const table of ['version', 'job', 'archive', 'schedule', 'subscription']) {
    await client.query(`alter table pgboss.${quoteIdent(table)} owner to fabsoft_worker`);
  }
  await client.query(`alter type pgboss.job_state owner to fabsoft_worker`);
  await client.query(`grant usage on schema pgboss to fabsoft_app`);
  await client.query(
    `grant select, insert, update, delete on all tables in schema pgboss to fabsoft_app`,
  );
  await client.query(`grant usage, select on all sequences in schema pgboss to fabsoft_app`);
  console.log(
    JSON.stringify({ msg: 'pgboss.installed', database: target.database, schema: 'pgboss' }),
  );
} finally {
  await client.end();
}
