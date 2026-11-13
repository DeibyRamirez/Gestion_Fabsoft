/**
 * Elevación efímera para aplicar 0002–0005 como fabsoft_migrator (sin SUPERUSER/CREATEROLE)
 * y stubs/grants temporales para 0006+ (CREATE ROLE / ALTER OWNER sin CREATEROLE).
 * en bases desechables marcadas por el harness. Los SQL 0001–0005 no se modifican.
 */
import type pg from 'pg';
import { quoteIdent } from './database-url.js';
import { repairHistoricalMigrationGrants } from './historical-migration-grant-repair.js';

const MIGRATOR = 'fabsoft_migrator';
const BOOTSTRAP = 'fabsoft_bootstrap';

/** Roles que 0002–0006 crean condicionalmente; deben existir antes del dbmate del migrador. */
const STUB_ROLE_DDL: readonly { name: string; sql: string }[] = [
  {
    name: 'fabsoft_app',
    sql: `create role fabsoft_app nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
  },
  {
    name: 'fabsoft_worker',
    sql: `create role fabsoft_worker nologin nosuperuser nocreatedb nocreaterole inherit nobypassrls`,
  },
  {
    name: 'fabsoft_secure_view',
    sql: `create role fabsoft_secure_view nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
  },
  {
    name: 'fabsoft_auth_definer',
    sql: `create role fabsoft_auth_definer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
  },
  {
    name: 'fabsoft_bootstrap',
    sql: `create role fabsoft_bootstrap nologin nosuperuser nocreatedb nocreaterole inherit nobypassrls`,
  },
  {
    name: 'fabsoft_audit_definer',
    sql: `create role fabsoft_audit_definer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
  },
];

const SET_ROLE_TARGETS = [
  'fabsoft_app',
  'fabsoft_worker',
  'fabsoft_secure_view',
  'fabsoft_auth_definer',
  'fabsoft_bootstrap',
] as const;

type QueryFn = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;

export class MigratorElevationError extends Error {
  readonly statement: string;
  readonly pgCode: string | undefined;
  constructor(message: string, statement: string, pgCode?: string) {
    super(message);
    this.statement = statement;
    this.pgCode = pgCode;
  }
}

async function exec(owner: QueryFn, statement: string): Promise<void> {
  try {
    await owner(statement);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    throw new MigratorElevationError(
      `Elevación migrator falló: ${(err as Error).message}`,
      statement,
      code,
    );
  }
}

/** Sólo BD con marcador fabsoft.seed_ephemeral (harness / CI desechable). */
export async function assertEphemeralDatabase(query: QueryFn): Promise<void> {
  const { rows } = (await query(`select current_setting('fabsoft.seed_ephemeral', true) as m`)) as {
    rows: { m: string | null }[];
  };
  const marker = rows[0]?.m?.trim();
  if (!marker) {
    throw new Error(
      '0002–0005 con elevación efímera: la base debe tener fabsoft.seed_ephemeral (BD desechable)',
    );
  }
}

export async function precreateStubRoles(owner: QueryFn): Promise<void> {
  for (const stub of STUB_ROLE_DDL) {
    const { rows } = (await owner(
      `select exists(select 1 from pg_catalog.pg_roles where rolname = $1) as exists`,
      [stub.name],
    )) as { rows: { exists: boolean }[] };
    if (rows[0]?.exists) continue;
    await exec(owner, stub.sql);
  }
}

/** Membresías y CREATE temporales para que el migrador ejecute 0002–0005 sin CREATEROLE. */
/** Restaura USAGE/OWNER en `app` tras cierre (CASCADE puede afectar privilegios efectivos). */
export async function repairMigratorSchemaPrivileges(owner: QueryFn): Promise<void> {
  const { rows } = (await owner(
    `select pg_catalog.pg_get_userbyid(nspowner)::text as owner
     from pg_catalog.pg_namespace where nspname = 'app'`,
  )) as { rows: { owner: string | null }[] };
  if (!rows[0]?.owner) return;
  if (rows[0].owner !== MIGRATOR) {
    await exec(owner, `alter schema app owner to ${quoteIdent(MIGRATOR)}`);
  }
  await exec(owner, `grant usage, create on schema public to ${quoteIdent(MIGRATOR)}`);
  await exec(owner, `grant all on schema app to ${quoteIdent(MIGRATOR)} with grant option`);
  await exec(
    owner,
    `grant select, insert, update, delete on all tables in schema app to ${quoteIdent(MIGRATOR)}`,
  );
  await exec(
    owner,
    `grant usage, select on all sequences in schema app to ${quoteIdent(MIGRATOR)}`,
  );
}

const HISTORICAL_SCHEMA_DDL_ROLES = [
  'fabsoft_secure_view',
  'fabsoft_auth_definer',
  'fabsoft_worker',
] as const;

/** CREATE efímero en `app` para ALTER OWNER en 0003/0005; revocar en teardown (P0). */
export async function grantHistoricalRoleSchemaCreate(owner: QueryFn): Promise<void> {
  for (const role of HISTORICAL_SCHEMA_DDL_ROLES) {
    await exec(owner, `grant usage, create on schema app to ${quoteIdent(role)}`);
  }
}

/** Tras 0002–0005: sólo USAGE (como develop); worker sin DDL en `app`. */
export async function revokeHistoricalRoleSchemaCreate(owner: QueryFn): Promise<void> {
  for (const role of HISTORICAL_SCHEMA_DDL_ROLES) {
    await exec(owner, `revoke create on schema app from ${quoteIdent(role)}`);
  }
}

export type MigratorMembershipRow = {
  granted_role: string;
  admin_option: boolean;
  set_option: boolean;
  inherit_option: boolean;
  depth: number;
};

/** Cierre transitivo: membresías alcanzables desde el rol (pg_auth_members + inherit). */
export const MIGRATOR_MEMBERSHIP_CLOSURE_SQL = `
with recursive chain as (
  select m.member, m.roleid, m.admin_option, m.set_option, m.inherit_option, 0 as depth
  from pg_catalog.pg_auth_members m
  join pg_catalog.pg_roles member on member.oid = m.member
  where member.rolname = $1
  union all
  select m.member, m.roleid, m.admin_option, m.set_option, m.inherit_option, c.depth + 1
  from pg_catalog.pg_auth_members m
  join chain c on m.member = c.roleid
  where c.depth < 32
)
select distinct granted.rolname::text as granted_role,
       c.admin_option, c.set_option, c.inherit_option, c.depth
from chain c
join pg_catalog.pg_roles granted on granted.oid = c.roleid
order by 1, 4`;

export async function queryMigratorMembershipClosure(
  owner: QueryFn,
  role = MIGRATOR,
): Promise<MigratorMembershipRow[]> {
  const { rows } = (await owner(MIGRATOR_MEMBERSHIP_CLOSURE_SQL, [role])) as {
    rows: MigratorMembershipRow[];
  };
  return rows;
}

export async function elevateMigratorForHistoricalMigrations(
  owner: QueryFn,
  databaseName: string,
): Promise<void> {
  const db = quoteIdent(databaseName);
  await exec(owner, `grant create on database ${db} to ${quoteIdent(MIGRATOR)} with grant option`);
  await exec(
    owner,
    `grant ${quoteIdent('fabsoft_worker')} to ${quoteIdent(MIGRATOR)} with inherit true, set true`,
  );
  await exec(
    owner,
    `grant ${quoteIdent('fabsoft_secure_view')} to ${quoteIdent(MIGRATOR)} with inherit false, set true`,
  );
  await exec(
    owner,
    `grant ${quoteIdent('fabsoft_auth_definer')} to ${quoteIdent(MIGRATOR)} with inherit false, set true`,
  );
  await exec(
    owner,
    `grant ${quoteIdent('fabsoft_app')} to ${quoteIdent(MIGRATOR)} with inherit false, set true, admin true`,
  );
}

/**
 * Cierre administrativo (provisioner, no migrator): re-emite app→worker y retira la elevación.
 * fabsoft_bootstrap no ejecuta 0002–0005; permanece aislado como rol de arranque.
 */
export async function revokeMigratorHistoricalElevation(
  owner: QueryFn,
  databaseName: string,
): Promise<void> {
  const db = quoteIdent(databaseName);
  await exec(owner, `grant ${quoteIdent('fabsoft_app')} to ${quoteIdent('fabsoft_worker')}`);
  await exec(owner, `revoke create on database ${db} from ${quoteIdent('fabsoft_app')}`);
  await exec(owner, `revoke create on database ${db} from ${quoteIdent('fabsoft_worker')}`);
  await exec(
    owner,
    `revoke admin option for ${quoteIdent('fabsoft_app')} from ${quoteIdent(MIGRATOR)} cascade`,
  );
  await exec(owner, `revoke ${quoteIdent('fabsoft_worker')} from ${quoteIdent(MIGRATOR)}`);
  await exec(owner, `revoke ${quoteIdent('fabsoft_secure_view')} from ${quoteIdent(MIGRATOR)}`);
  await exec(owner, `revoke ${quoteIdent('fabsoft_auth_definer')} from ${quoteIdent(MIGRATOR)}`);
  await exec(owner, `revoke ${quoteIdent('fabsoft_audit_definer')} from ${quoteIdent(MIGRATOR)}`);
  await exec(owner, `revoke ${quoteIdent('fabsoft_app')} from ${quoteIdent(MIGRATOR)}`);
  // CASCADE sólo sobre privilegios de DATABASE otorgados por el migrador (p. ej. CREATE a app en 0002).
  await exec(owner, `revoke all privileges on database ${db} from ${quoteIdent(MIGRATOR)} cascade`);
  await exec(owner, `grant connect on database ${db} to ${quoteIdent(MIGRATOR)}`);
  await exec(owner, `grant ${quoteIdent('fabsoft_app')} to ${quoteIdent('fabsoft_worker')}`);
  await revokeHistoricalRoleSchemaCreate(owner);
  await repairHistoricalMigrationGrants(owner);
}

/** SET temporal hacia fabsoft_audit_definer para ALTER OWNER en 0006 (revocar antes de gates). */
export async function elevateMigratorForFutureMigrations(owner: QueryFn): Promise<void> {
  // INHERIT TRUE: PG exige membresía efectiva para ALTER OWNER; SET solo no basta (42501 schema app).
  await exec(
    owner,
    `grant ${quoteIdent('fabsoft_audit_definer')} to ${quoteIdent(MIGRATOR)} with inherit true, set true, admin true`,
  );
}

export async function revokeMigratorFutureElevation(owner: QueryFn): Promise<void> {
  await exec(owner, `revoke ${quoteIdent('fabsoft_audit_definer')} from ${quoteIdent(MIGRATOR)}`);
}

/** Tras 0006: migrator crea la función; el dueño definer lo fija el provisioner (ALTER OWNER). */
export async function assignAuditWriteDefinerOwner(owner: QueryFn): Promise<void> {
  const { rows } = (await owner(
    `select exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname = 'audit_write'
     ) as ok`,
  )) as { rows: { ok: boolean }[] };
  if (!rows[0]?.ok) return;
  const auditFns = [
    'app.audit_is_secret_key(text)',
    'app.audit_allowlist_keys(text)',
    'app.audit_redact_jsonb(jsonb, text[], boolean)',
    'app.audit_redact_jsonb_array(jsonb, text[], boolean, text)',
    'app.audit_prepare_changes(text, text, jsonb, boolean)',
    'app.audit_resolve_client_id(text, text)',
    'app.audit_resource_exists(text, text)',
    'app.audit_write(text, text, text, jsonb, text, inet)',
  ];
  for (const fn of auditFns) {
    await exec(owner, `alter function ${fn} owner to fabsoft_audit_definer`);
  }
}

export async function assertMigratorElevationClosed(owner: QueryFn): Promise<void> {
  const rows = await queryMigratorMembershipClosure(owner, MIGRATOR);
  if (rows.length > 0) {
    throw new Error(`Migrator conserva membresías tras cierre efímero: ${JSON.stringify(rows)}`);
  }
  const { rows: grantedByMigrator } = (await owner(
    `select grantor.rolname::text as grantor, granted.rolname::text as granted, member.rolname::text as member
     from pg_catalog.pg_auth_members am
     join pg_catalog.pg_roles grantor on grantor.oid = am.grantor
     join pg_catalog.pg_roles granted on granted.oid = am.roleid
     join pg_catalog.pg_roles member on member.oid = am.member
     where grantor.rolname = $1`,
    [MIGRATOR],
  )) as {
    rows: { grantor: string; granted: string; member: string }[];
  };
  if (grantedByMigrator.length > 0) {
    throw new Error(
      `Privilegios de rol aún otorgados por migrator tras cierre: ${JSON.stringify(grantedByMigrator)}`,
    );
  }
  const { rows: asMember } = (await owner(
    `select granted.rolname::text as granted_role
     from pg_catalog.pg_auth_members am
     join pg_catalog.pg_roles member on member.oid = am.member
     join pg_catalog.pg_roles granted on granted.oid = am.roleid
     where member.rolname = $1`,
    [MIGRATOR],
  )) as { rows: { granted_role: string }[] };
  if (asMember.length > 0) {
    throw new Error(
      `Migrator sigue siendo miembro de otros roles tras cierre: ${JSON.stringify(asMember)}`,
    );
  }
  const { rows: privs } = (await owner(
    `select rolname, rolcreatedb, rolcreaterole from pg_roles where rolname = $1`,
    [MIGRATOR],
  )) as { rows: { rolname: string; rolcreatedb: boolean; rolcreaterole: boolean }[] };
  const m = privs[0];
  if (!m || m.rolcreaterole || m.rolcreatedb) {
    throw new Error(`Atributos inesperados en migrator tras cierre: ${JSON.stringify(m)}`);
  }
}

export { SET_ROLE_TARGETS, STUB_ROLE_DDL, MIGRATOR, BOOTSTRAP };
