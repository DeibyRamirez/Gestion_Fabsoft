/**
 * Instantáneas de owners y ACL para paridad fresh vs upgrade (F0).
 */
import pg from 'pg';
import { normalizeDatabaseUrl } from './database-url.js';

export type SchemaAclSnapshot = {
  tableOwners: Record<string, string>;
  relacl: Record<string, string | null>;
  nspacl: string | null;
  proacl: Record<string, string | null>;
  defaultAcl: string[];
  eventTriggers: string[];
};

async function withClient<T>(databaseUrl: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(databaseUrl) });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export async function captureSchemaAclSnapshot(databaseUrl: string): Promise<SchemaAclSnapshot> {
  return withClient(databaseUrl, async (c) => {
    const { rows: tables } = await c.query<{ tablename: string; owner: string }>(
      `select c.relname as tablename, pg_catalog.pg_get_userbyid(c.relowner)::text as owner
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'app' and c.relkind = 'r'
       order by 1`,
    );
    const tableOwners: Record<string, string> = {};
    for (const t of tables) tableOwners[t.tablename] = t.owner;

    const { rows: rels } = await c.query<{ name: string; acl: string | null }>(
      `select c.relname as name, c.relacl::text as acl
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'app' and c.relkind in ('r','v','S')
       order by 1`,
    );
    const relacl: Record<string, string | null> = {};
    for (const r of rels) relacl[r.name] = r.acl;

    const { rows: ns } = await c.query<{ acl: string | null }>(
      `select nspacl::text as acl from pg_namespace where nspname = 'app'`,
    );
    const { rows: procs } = await c.query<{ name: string; acl: string | null }>(
      `select p.proname as name, p.proacl::text as acl
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.prokind = 'f'`,
    );
    const proacl: Record<string, string | null> = {};
    for (const p of procs) proacl[p.name] = p.acl;

    const { rows: def } = await c.query<{ line: string }>(
      `select format('%s:%s:%s', pg_catalog.pg_get_userbyid(d.defaclrole),
              coalesce(defaclobjtype,''), coalesce(defaclacl::text,''))
             as line
       from pg_default_acl d
       join pg_namespace n on n.oid = d.defaclnamespace
       where n.nspname = 'app'
       order by line`,
    );

    const { rows: ets } = await c.query<{ evtname: string }>(
      `select evtname from pg_event_trigger where evtname like 'fabsoft_%' order by 1`,
    );

    return {
      tableOwners,
      relacl,
      nspacl: ns[0]?.acl ?? null,
      proacl,
      defaultAcl: def.map((d) => d.line),
      eventTriggers: ets.map((e) => e.evtname),
    };
  });
}

export function assertSchemaAclParity(
  a: SchemaAclSnapshot,
  b: SchemaAclSnapshot,
): { relaclDiff: boolean; proaclDiff: boolean } {
  if (JSON.stringify(a.tableOwners) !== JSON.stringify(b.tableOwners)) {
    throw new Error(
      `Owners de tablas app difieren fresh vs upgrade: ${JSON.stringify({ a: a.tableOwners, b: b.tableOwners })}`,
    );
  }
  const nspaclDiff = a.nspacl !== b.nspacl;
  const defaultAclDiff = JSON.stringify(a.defaultAcl) !== JSON.stringify(b.defaultAcl);
  const relaclDiff = JSON.stringify(a.relacl) !== JSON.stringify(b.relacl);
  const proaclDiff = JSON.stringify(a.proacl) !== JSON.stringify(b.proacl);
  return { relaclDiff, proaclDiff, nspaclDiff, defaultAclDiff };
}
