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

/** Privilegios idempotentes al cerrar elevación / tras db:migrate histórico. */
export async function repairHistoricalMigrationGrants(owner: QueryFn): Promise<void> {
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
    // PO: objetos futuros del migrator en app sin EXECUTE a PUBLIC
    `alter default privileges for role ${quoteIdent(MIGRATOR)} in schema app revoke execute on functions from public`,
    `alter default privileges for role ${quoteIdent(MIGRATOR)} in schema app grant select, insert, update on tables to fabsoft_app`,
    `alter default privileges for role ${quoteIdent(MIGRATOR)} in schema app grant usage, select on sequences to fabsoft_app`,
    `alter default privileges for role ${quoteIdent(MIGRATOR)} in schema app grant execute on functions to fabsoft_app`,
  ];
  for (const sql of stmts) await run(owner, sql);
}

export const DEFINER_FUNCTION_PRIVILEGE_CHECKS = [
  {
    fn: 'app.bootstrap_first_admin(text,text,text)',
    roles: [
      { role: 'public', execute: false },
      { role: 'fabsoft_app', execute: false },
      { role: 'fabsoft_bootstrap', execute: true },
    ],
  },
  {
    fn: 'app.revoke_user_sessions(uuid,text,text)',
    roles: [
      { role: 'public', execute: false },
      { role: 'fabsoft_app', execute: true },
    ],
  },
  {
    fn: 'app.client_has_visible_product(uuid)',
    roles: [
      { role: 'public', execute: false },
      { role: 'fabsoft_app', execute: true },
    ],
  },
  {
    fn: 'app.auth_password_hash(uuid)',
    roles: [
      { role: 'public', execute: false },
      { role: 'fabsoft_app', execute: true },
    ],
  },
  {
    fn: 'app.integration_reads_subscriptions(uuid)',
    roles: [
      { role: 'public', execute: false },
      { role: 'fabsoft_app', execute: true },
    ],
  },
] as const;
