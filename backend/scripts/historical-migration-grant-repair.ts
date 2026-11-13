/**
 * Reaplica REVOKE/GRANT que 0003–0005 emiten tras ALTER OWNER cuando el ejecutor
 * ya no es dueño (WARNING 74). Corre como provisioner (superuser/owner).
 */
import type pg from 'pg';
import { quoteIdent } from './database-url.js';

const MIGRATOR = 'fabsoft_migrator';

type QueryFn = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;

async function run(owner: QueryFn, sql: string): Promise<void> {
  await owner(sql);
}

/** Fail-closed si hay EXECUTE a PUBLIC fuera del set que el repair va a revocar. */
/** Fail-closed tras migrate sin repair histórico: ningún prosecdef app con PUBLIC. */
export async function assertStrictNoPublicExecuteOnAppDefiners(owner: QueryFn): Promise<void> {
  const { rows } = (await owner(
    `select p.proname::text || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as sig
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app'
       and p.prosecdef
       and has_function_privilege('public', p.oid, 'EXECUTE')`,
  )) as pg.QueryResult<{ sig: string }>;
  if (rows.length > 0) {
    throw new Error(
      `EXECUTE a PUBLIC en SECURITY DEFINER (sin repair): ${rows.map((r) => r.sig).join(', ')}`,
    );
  }
}

export async function assertNoUnexpectedPublicExecuteBeforeRepair(owner: QueryFn): Promise<void> {
  const { rows } = (await owner(
    `select p.proname::text || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as sig
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app'
       and p.prosecdef
       and has_function_privilege('public', p.oid, 'EXECUTE')
       and p.proname not in (
         'client_has_visible_product',
         'auth_password_hash',
         'integration_reads_subscriptions',
         'bootstrap_first_admin',
         'revoke_user_sessions'
       )`,
  )) as pg.QueryResult<{ sig: string }>;
  if (rows.length > 0) {
    throw new Error(
      `GRANT EXECUTE inesperado a PUBLIC (SECURITY DEFINER) antes de repair: ${rows.map((r) => r.sig).join(', ')}`,
    );
  }
}

/** Privilegios idempotentes al cerrar elevación / tras db:migrate histórico. */
export async function repairHistoricalMigrationGrants(owner: QueryFn): Promise<void> {
  await assertNoUnexpectedPublicExecuteBeforeRepair(owner);
  const stmts = [
    `grant usage on schema app to fabsoft_worker`,
    `revoke execute on function app.client_has_visible_product(uuid) from public`,
    `grant execute on function app.client_has_visible_product(uuid) to fabsoft_app`,
    `revoke execute on function app.auth_password_hash(uuid) from public`,
    `grant execute on function app.auth_password_hash(uuid) to fabsoft_app`,
    `revoke execute on function app.integration_reads_subscriptions(uuid) from public`,
    `grant execute on function app.integration_reads_subscriptions(uuid) to fabsoft_app, fabsoft_secure_view`,
    `revoke execute on function app.bootstrap_first_admin(text, text, text) from public, fabsoft_app`,
    `grant execute on function app.bootstrap_first_admin(text, text, text) to fabsoft_bootstrap`,
    `revoke execute on function app.revoke_user_sessions(uuid, text, text) from public`,
    `grant execute on function app.revoke_user_sessions(uuid, text, text) to fabsoft_app`,
    `revoke execute on function app.tg_enforce_rls_on_create() from fabsoft_app`,
    // PO: default global + schema app — sin EXECUTE a PUBLIC en funciones nuevas del migrator
    `alter default privileges for role ${quoteIdent(MIGRATOR)} revoke execute on functions from public`,
    `alter default privileges for role ${quoteIdent(MIGRATOR)} in schema app revoke execute on functions from public`,
    `alter default privileges for role ${quoteIdent(MIGRATOR)} in schema app revoke execute on functions from fabsoft_app`,
    `alter default privileges for role ${quoteIdent(MIGRATOR)} in schema app grant select, insert, update on tables to fabsoft_app`,
    `alter default privileges for role ${quoteIdent(MIGRATOR)} in schema app grant usage, select on sequences to fabsoft_app`,
  ];
  for (const sql of stmts) await run(owner, sql);
}

/** Roles que heredan EXECUTE de `fabsoft_app` vía `GRANT fabsoft_app TO fabsoft_worker` (0003). */
const workerInheritsAppExecute = { role: 'fabsoft_worker', execute: true } as const;
const denyNonApp = [
  { role: 'fabsoft_seed_writer', execute: false },
  { role: 'fabsoft_migrator', execute: false },
] as const;

export const DEFINER_FUNCTION_PRIVILEGE_CHECKS = [
  {
    fn: 'app.bootstrap_first_admin(text,text,text)',
    roles: [
      { role: 'public', execute: false },
      { role: 'fabsoft_app', execute: false },
      { role: 'fabsoft_bootstrap', execute: true },
      { role: 'fabsoft_worker', execute: false },
      ...denyNonApp,
    ],
  },
  {
    fn: 'app.revoke_user_sessions(uuid,text,text)',
    roles: [
      { role: 'public', execute: false },
      { role: 'fabsoft_app', execute: true },
      workerInheritsAppExecute,
      ...denyNonApp,
    ],
  },
  {
    fn: 'app.client_has_visible_product(uuid)',
    roles: [
      { role: 'public', execute: false },
      { role: 'fabsoft_app', execute: true },
      workerInheritsAppExecute,
      ...denyNonApp,
    ],
  },
  {
    fn: 'app.auth_password_hash(uuid)',
    roles: [
      { role: 'public', execute: false },
      { role: 'fabsoft_app', execute: true },
      workerInheritsAppExecute,
      ...denyNonApp,
    ],
  },
  {
    fn: 'app.integration_reads_subscriptions(uuid)',
    roles: [
      { role: 'public', execute: false },
      { role: 'fabsoft_app', execute: true },
      { role: 'fabsoft_secure_view', execute: true },
      workerInheritsAppExecute,
      ...denyNonApp,
    ],
  },
] as const;
