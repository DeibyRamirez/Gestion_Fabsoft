import pg from 'pg';
import { normalizeDatabaseUrl } from './database-url.js';
import { DEFINER_FUNCTION_PRIVILEGE_CHECKS } from './historical-migration-grant-repair.js';

function normSig(fn: string): string {
  return fn.replace(/\s+/g, '').replace(/,,/g, ',');
}

function isNonSystemSchema(nsp: string): boolean {
  if (nsp === 'pg_catalog' || nsp === 'information_schema') return false;
  if (nsp.startsWith('pg_toast')) return false;
  if (nsp.startsWith('pg_temp')) return false;
  return true;
}

/** Dueños permitidos de funciones SECURITY DEFINER en schema app (fail-closed). */
export const APP_SECURITY_DEFINER_OWNERS = new Set([
  'fabsoft_auth_definer',
  'fabsoft_audit_definer',
  'fabsoft_secure_view',
]);

function expectedExecute(fn: string, role: string): boolean {
  const n = normSig(fn);
  const spec = DEFINER_FUNCTION_PRIVILEGE_CHECKS.find((s) => normSig(s.fn) === n);
  if (!spec) return false;
  const row = spec.roles.find((r) => r.role === role);
  return row?.execute ?? false;
}

export async function assertSecurityDefinerOwnersAllowlist(databaseUrl: string): Promise<void> {
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(databaseUrl) });
  await c.connect();
  try {
    const { rows } = await c.query<{ fn: string; owner: string }>(
      `select n.nspname::text || '.' || p.proname::text || '(' ||
              pg_catalog.oidvectortypes(p.proargtypes) || ')' as fn,
              pg_get_userbyid(p.proowner)::text as owner
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.prosecdef
       order by 1`,
    );
    const bad = rows.filter((r) => !APP_SECURITY_DEFINER_OWNERS.has(r.owner));
    if (bad.length > 0) {
      throw new Error(
        `Gate prosecdef: dueños no allowlisted: ${bad.map((r) => `${r.fn}@${r.owner}`).join(', ')}`,
      );
    }
  } finally {
    await c.end();
  }
}

export async function assertDefinerExecuteAllowlist(databaseUrl: string): Promise<void> {
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(databaseUrl) });
  await c.connect();
  try {
    const { rows: prosecdef } = await c.query<{ fn: string }>(
      `select n.nspname::text || '.' || p.proname::text || '(' ||
              pg_catalog.oidvectortypes(p.proargtypes) || ')' as fn
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef
       order by 1`,
    );
    const inScope = prosecdef.filter((r) => {
      const schema = r.fn.split('.')[0] ?? '';
      return isNonSystemSchema(schema);
    });

    const allowlisted = new Set(DEFINER_FUNCTION_PRIVILEGE_CHECKS.map((s) => normSig(s.fn)));
    const missing = inScope.map((r) => r.fn).filter((fn) => !allowlisted.has(normSig(fn)));
    if (missing.length > 0) {
      throw new Error(
        `Gate prosecdef: SECURITY DEFINER sin entrada en allowlist: ${missing.join(', ')}`,
      );
    }

    const { rows: roles } = await c.query<{ rolname: string }>(
      `select rolname from pg_catalog.pg_roles where not rolsuper order by rolname`,
    );

    for (const { fn } of inScope) {
      const meta = await c.query<{ owner: string }>(
        `select pg_get_userbyid(p.proowner)::text as owner from pg_proc p where p.oid = $1::regprocedure`,
        [fn],
      );
      const fnOwner = meta.rows[0]?.owner;

      for (const { rolname: role } of roles) {
        if (role === fnOwner) continue;
        const want = expectedExecute(fn, role);
        const { rows: eff } = await c.query<{ ok: boolean }>(
          `select has_function_privilege($1, $2::regprocedure, 'EXECUTE') as ok`,
          [role, fn],
        );
        const effective = eff[0]?.ok ?? false;
        if (effective !== want) {
          throw new Error(
            `Gate prosecdef: ${fn} role=${role} execute=${effective} (esperado ${want})`,
          );
        }
      }
    }
  } finally {
    await c.end();
  }
}

/** @deprecated use assertDefinerExecuteAllowlist */
export async function assertNoSecurityDefinerPublicExecute(databaseUrl: string): Promise<void> {
  await assertDefinerExecuteAllowlist(databaseUrl);
}
