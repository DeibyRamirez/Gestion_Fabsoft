import pg from 'pg';
import { normalizeDatabaseUrl } from './database-url.js';
import { DEFINER_FUNCTION_PRIVILEGE_CHECKS } from './historical-migration-grant-repair.js';

const CHECKED_ROLES = [
  'public',
  'fabsoft_app',
  'fabsoft_worker',
  'fabsoft_bootstrap',
  'fabsoft_secure_view',
] as const;

function normSig(fn: string): string {
  return fn.replace(/\s+/g, '').replace(/,,/g, ',');
}

function expectedExecute(fn: string, role: string): boolean {
  const n = normSig(fn);
  const spec = DEFINER_FUNCTION_PRIVILEGE_CHECKS.find((s) => normSig(s.fn) === n);
  if (!spec) return false;
  const row = spec.roles.find((r) => r.role === role);
  return row?.execute ?? false;
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
         and n.nspname = 'app'
       order by 1`,
    );

    const allowlisted = new Set(DEFINER_FUNCTION_PRIVILEGE_CHECKS.map((s) => normSig(s.fn)));
    const missing = prosecdef.map((r) => r.fn).filter((fn) => !allowlisted.has(normSig(fn)));
    if (missing.length > 0) {
      throw new Error(
        `Gate prosecdef: SECURITY DEFINER sin entrada en allowlist: ${missing.join(', ')}`,
      );
    }

    for (const { fn } of prosecdef) {
      const meta = await c.query<{ owner: string }>(
        `select pg_get_userbyid(p.proowner)::text as owner from pg_proc p where p.oid = $1::regprocedure`,
        [fn],
      );
      const fnOwner = meta.rows[0]?.owner;

      const { rows: direct } = await c.query<{ rolname: string }>(
        `select r.rolname
         from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         join pg_roles r on r.oid = a.grantee
         where p.oid = $1::regprocedure
           and a.privilege_type = 'EXECUTE'`,
        [fn],
      );
      const directGrants = new Set(direct.map((d) => d.rolname));

      for (const role of CHECKED_ROLES) {
        if (role === fnOwner) continue;
        const want = expectedExecute(fn, role);
        const directExec = directGrants.has(role);
        const effective = await c
          .query<{ ok: boolean }>(`select has_function_privilege($1, $2::regprocedure, 'EXECUTE') as ok`, [
            role,
            fn,
          ])
          .then((r) => r.rows[0]?.ok ?? false);

        const actual =
          role === 'fabsoft_worker' || role === 'fabsoft_bootstrap' || role === 'fabsoft_secure_view'
            ? directExec
            : effective;

        if (actual !== want) {
          throw new Error(
            `Gate prosecdef: ${fn} role=${role} execute=${actual} (esperado ${want}, direct=${directExec}, effective=${effective})`,
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
