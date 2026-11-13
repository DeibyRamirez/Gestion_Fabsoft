/**
 * Instantáneas de owners y ACL (aclexplode, sin grantor) para paridad fresh vs upgrade (F0).
 */
import pg from 'pg';
import { normalizeDatabaseUrl } from './database-url.js';

const LEGACY_OWNER = 'fabsoft_owner';

export type SchemaAclSnapshot = {
  tableOwners: Record<string, string>;
  aclLines: string[];
  eventTriggers: string[];
};

const GRANTEE_EXPR = `case when a.grantee = 0 then 'public'
             else pg_catalog.pg_get_userbyid(a.grantee)::text end`;

const ACL_LINES_SQL = `
select coalesce(json_agg(line order by line), '[]'::json)::text as lines
from (
  select distinct format('%s|%s|%s', class, obj, grantee_priv) as line
  from (
    select 'nsp' as class, n.nspname::text as obj,
           a.privilege_type || ':' || ${GRANTEE_EXPR} as grantee_priv
    from pg_namespace n
    cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
    where n.nspname = 'app'
      and ${GRANTEE_EXPR} not in ($1, 'postgres', '-')
    union all
    select 'rel' as class, c.relname::text as obj,
           a.privilege_type || ':' || ${GRANTEE_EXPR} as grantee_priv
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault(c.relkind::"char", c.relowner))) a
    where n.nspname = 'app' and c.relkind in ('r','v','S','m','c','f')
      and ${GRANTEE_EXPR} not in ($1, 'postgres', '-')
    union all
    select 'att' as class, c.relname::text || '.' || a2.attname::text as obj,
           a.privilege_type || ':' || ${GRANTEE_EXPR} as grantee_priv
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a2 on a2.attrelid = c.oid and a2.attnum > 0 and not a2.attisdropped
    cross join lateral aclexplode(coalesce(a2.attacl, acldefault('c', c.relowner))) a
    where n.nspname = 'app' and c.relkind = 'r'
      and ${GRANTEE_EXPR} not in ($1, 'postgres', '-')
    union all
    select 'pro' as class,
           p.proname::text || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as obj,
           a.privilege_type || ':' || ${GRANTEE_EXPR} as grantee_priv
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = 'app'
      and ${GRANTEE_EXPR} not in ($1, 'postgres', '-')
    union all
    select 'typ' as class, t.typname::text as obj,
           a.privilege_type || ':' || ${GRANTEE_EXPR} as grantee_priv
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    cross join lateral aclexplode(coalesce(t.typacl, acldefault('T', t.typowner))) a
    where n.nspname = 'app' and t.typtype in ('c','e','d')
      and ${GRANTEE_EXPR} not in ($1, 'postgres', '-')
    union all
    select 'defacl' as class,
           pg_catalog.pg_get_userbyid(d.defaclrole)::text || ':' ||
           coalesce(d.defaclobjtype::text, '*') || ':' ||
           coalesce(n.nspname::text, '_global_') as obj,
           a.privilege_type || ':' || ${GRANTEE_EXPR} as grantee_priv
    from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where (n.nspname = 'app' or d.defaclnamespace = 0)
      and ${GRANTEE_EXPR} not in ($1, 'postgres', '-')
  ) sub
) ordered`;

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

    const { rows: acl } = await c.query<{ lines: string }>(ACL_LINES_SQL, [LEGACY_OWNER]);
    const aclLines = JSON.parse(acl[0]?.lines ?? '[]') as string[];

    const { rows: ets } = await c.query<{ evtname: string }>(
      `select evtname from pg_event_trigger where evtname like 'fabsoft_%' order by 1`,
    );

    return {
      tableOwners,
      aclLines,
      eventTriggers: ets.map((e) => e.evtname),
    };
  });
}

const ALLOWED_EVENT_TRIGGER_ASYMMETRY = ['fabsoft_enforce_rls'] as const;

function normalizeAclLines(lines: string[]): string[] {
  return lines.filter((l) => !l.startsWith(`defacl|${LEGACY_OWNER}:`));
}

export function assertSchemaAclParity(a: SchemaAclSnapshot, b: SchemaAclSnapshot): void {
  if (JSON.stringify(a.tableOwners) !== JSON.stringify(b.tableOwners)) {
    throw new Error(
      `Owners de tablas app difieren fresh vs upgrade: ${JSON.stringify({ a: a.tableOwners, b: b.tableOwners })}`,
    );
  }
  const aLines = normalizeAclLines(a.aclLines);
  const bLines = normalizeAclLines(b.aclLines);
  if (JSON.stringify(aLines) !== JSON.stringify(bLines)) {
    const setA = new Set(aLines);
    const setB = new Set(bLines);
    const onlyA = aLines.filter((l) => !setB.has(l));
    const onlyB = bLines.filter((l) => !setA.has(l));
    throw new Error(
      `ACL aclexplode difiere fresh vs upgrade (sin grantor/owner defacl): len ${aLines.length} vs ${bLines.length}; onlyFresh=${JSON.stringify(onlyA.slice(0, 8))} onlyUpgrade=${JSON.stringify(onlyB.slice(0, 8))}`,
    );
  }
  if (JSON.stringify(a.eventTriggers) !== JSON.stringify(b.eventTriggers)) {
    const onlyInB = b.eventTriggers.filter((t) => !a.eventTriggers.includes(t));
    const onlyInA = a.eventTriggers.filter((t) => !b.eventTriggers.includes(t));
    const allowed =
      onlyInA.length === 0 &&
      onlyInB.every((t) => (ALLOWED_EVENT_TRIGGER_ASYMMETRY as readonly string[]).includes(t));
    if (!allowed) {
      throw new Error(
        `Event triggers difieren (sólo permitido upgrade+${ALLOWED_EVENT_TRIGGER_ASYMMETRY.join(',')}): fresh=${JSON.stringify(a.eventTriggers)} upgrade=${JSON.stringify(b.eventTriggers)}`,
      );
    }
  }
}
