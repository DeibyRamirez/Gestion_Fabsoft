/**
 * Tras upgrade histórico (owner aplicó 0001–0005): reasigna objetos `app` de fabsoft_owner
 * al migrator, default privileges del migrator y revoca CREATE ON DATABASE.
 */
import pg from 'pg';
import { normalizeDatabaseUrl, quoteIdent } from './database-url.js';
import { repairHistoricalMigrationGrants } from './historical-migration-grant-repair.js';

const MIGRATOR = 'fabsoft_migrator';
const LEGACY_OWNER = 'fabsoft_owner';

export async function reconcileFabsoftOwnerAppObjectsToMigrator(
  provisionDatabaseUrl: string,
  databaseName: string,
): Promise<number> {
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(provisionDatabaseUrl) });
  await c.connect();
  const q = (sql: string, params?: unknown[]) => c.query(sql, params);
  let count = 0;
  try {
    const { rows: ns } = await q(
      `select pg_catalog.pg_get_userbyid(nspowner)::text as owner
       from pg_namespace where nspname = 'app'`,
    );
    if (ns[0]?.owner === LEGACY_OWNER) {
      await q(`alter schema app owner to ${quoteIdent(MIGRATOR)}`);
      count += 1;
    }
    const reassignRels = async (kinds: string) => {
      const { rows: rels } = await q(
        `select n.nspname, c.relname, c.relkind::text as kind
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'app'
           and pg_catalog.pg_get_userbyid(c.relowner)::text = $1
           and c.relkind in (${kinds})`,
        [LEGACY_OWNER],
      );
      for (const r of rels) {
        const kind =
          r.kind === 'r'
            ? 'TABLE'
            : r.kind === 'S'
              ? 'SEQUENCE'
              : r.kind === 'v'
                ? 'VIEW'
                : r.kind === 'm'
                  ? 'MATERIALIZED VIEW'
                  : 'TABLE';
        await q(
          `alter ${kind} ${quoteIdent(r.nspname)}.${quoteIdent(r.relname)} owner to ${quoteIdent(MIGRATOR)}`,
        );
        count += 1;
      }
    };
    await reassignRels(`'r'`);
    await reassignRels(`'v','m'`);
    await reassignRels(`'S'`);
    const { rows: procs } = await q(
      `select n.nspname, p.proname,
              pg_catalog.oidvectortypes(p.proargtypes) as args
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app'
         and pg_catalog.pg_get_userbyid(p.proowner)::text = $1`,
      [LEGACY_OWNER],
    );
    for (const p of procs) {
      await q(
        `alter function ${quoteIdent(p.nspname)}.${quoteIdent(p.proname)}(${p.args}) owner to ${quoteIdent(MIGRATOR)}`,
      );
      count += 1;
    }
    const { rows: types } = await q(
      `select n.nspname, t.typname
       from pg_type t
       join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'app' and t.typtype in ('c','e','d')
         and pg_catalog.pg_get_userbyid(t.typowner)::text = $1`,
      [LEGACY_OWNER],
    );
    for (const t of types) {
      await q(
        `alter type ${quoteIdent(t.nspname)}.${quoteIdent(t.typname)} owner to ${quoteIdent(MIGRATOR)}`,
      );
      count += 1;
    }
    await repairHistoricalMigrationGrants(q);
    await q(`revoke create on database ${quoteIdent(databaseName)} from ${quoteIdent(MIGRATOR)}`);
    return count;
  } finally {
    await c.end();
  }
}

/** Falla cerrado si quedan objetos app/event trigger con owner legacy (post db:migrate). */
export async function assertNoFabsoftOwnerInApp(databaseUrl: string, label = 'app'): Promise<void> {
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(databaseUrl) });
  await c.connect();
  try {
    const { rows } = await c.query<{ kind: string; name: string }>(
      `select 'schema' as kind, 'app' as name
       where pg_catalog.pg_get_userbyid((select nspowner from pg_namespace where nspname='app'))::text = $1
       union all
       select c.relkind::text, c.relname::text
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'app' and pg_catalog.pg_get_userbyid(c.relowner)::text = $1
       union all
       select 'function', p.proname::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and pg_catalog.pg_get_userbyid(p.proowner)::text = $1`,
      [LEGACY_OWNER],
    );
    if (rows.length > 0) {
      throw new Error(
        `${label}: objetos aún owned by ${LEGACY_OWNER} (db:migrate debe reconciliar o fallar): ${JSON.stringify(rows)}`,
      );
    }
  } finally {
    await c.end();
  }
}
