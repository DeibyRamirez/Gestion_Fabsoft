/**
 * Exporta pg_policies del schema app a JSON (fidelidad develop).
 * Uso: DATABASE_MIGRATION_URL=... tsx scripts/export-app-rls-policies-snapshot.ts > tests/security/fixtures/app-rls-policies-develop.snapshot.json
 */
import pg from 'pg';
import { normalizeDatabaseUrl } from './database-url.js';

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.TEST_DATABASE_MIGRATION_URL;
if (!url) {
  console.error('DATABASE_MIGRATION_URL requerido');
  process.exit(1);
}

function normExpr(q: string | null): string | null {
  if (q === null) return null;
  return q.replace(/\s+/g, ' ').trim();
}

const client = new pg.Client({ connectionString: normalizeDatabaseUrl(url) });
await client.connect();
try {
  const { rows } = await client.query<{
    table: string;
    polname: string;
    polcmd: string;
    permissive: boolean;
    qual: string | null;
    with_check: string | null;
    roles: string[];
  }>(
    `select c.relname as table,
            p.polname,
            p.polcmd,
            p.polpermissive as permissive,
            pg_get_expr(p.polqual, p.polrelid) as qual,
            pg_get_expr(p.polwithcheck, p.polrelid) as with_check,
            coalesce(
              (select array_agg(r.rolname::text order by r.rolname::text)::text[]
               from unnest(p.polroles) u(oid)
               join pg_roles r on r.oid = u.oid),
              '{}'::text[]
            ) as roles
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'app'
     order by c.relname, p.polname`,
  );
  const policies = rows.map((r) => ({
    table: r.table,
    polname: r.polname,
    cmd: r.polcmd,
    permissive: r.permissive,
    qual: normExpr(r.qual),
    with_check: normExpr(r.with_check),
    roles: r.roles,
  }));
  console.log(JSON.stringify({ schema: 'app', policyCount: policies.length, policies }, null, 2));
} finally {
  await client.end();
}
