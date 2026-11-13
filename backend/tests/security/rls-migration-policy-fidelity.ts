/**
 * Fidelidad RLS schema app ↔ snapshot develop (pg_policies completo, sin reescritura en tests).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

export type AppPolicyRow = {
  table: string;
  polname: string;
  cmd: string;
  permissive: boolean;
  qual: string | null;
  with_check: string | null;
  roles: string[];
};

type SnapshotFile = {
  schema: string;
  policyCount: number;
  policies: AppPolicyRow[];
};

const snapshotPath = fileURLToPath(
  new URL('./fixtures/app-rls-policies-develop.snapshot.json', import.meta.url),
);

export function loadDevelopPolicySnapshot(): SnapshotFile {
  return JSON.parse(readFileSync(snapshotPath, 'utf8')) as SnapshotFile;
}

type SqlClient = Pick<pg.Client, 'query'>;

function normExpr(q: string | null): string | null {
  if (q === null) return null;
  return q.replace(/\s+/g, ' ').trim();
}

export async function fetchAppSchemaPolicies(client: SqlClient): Promise<AppPolicyRow[]> {
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
  return rows.map((r) => ({
    table: r.table,
    polname: r.polname,
    cmd: r.polcmd,
    permissive: r.permissive,
    qual: normExpr(r.qual),
    with_check: normExpr(r.with_check),
    roles: [...r.roles].sort(),
  }));
}

function policyKey(p: AppPolicyRow): string {
  return `${p.table}\0${p.polname}`;
}

export function assertAppPoliciesMatchDevelopSnapshot(live: AppPolicyRow[]): void {
  const expected = loadDevelopPolicySnapshot().policies;
  if (live.length !== expected.length) {
    throw new Error(
      `RLS: conteo ${live.length} distinto de develop (${expected.length})`,
    );
  }
  const byKey = new Map(live.map((p) => [policyKey(p), p]));
  const errors: string[] = [];
  for (const exp of expected) {
    const key = policyKey(exp);
    const act = byKey.get(key);
    if (!act) {
      errors.push(`falta política ${exp.table}.${exp.polname}`);
      continue;
    }
    for (const field of ['cmd', 'permissive', 'qual', 'with_check'] as const) {
      if (act[field] !== exp[field]) {
        errors.push(
          `${key}: ${field} esperado ${JSON.stringify(exp[field])} obtuvo ${JSON.stringify(act[field])}`,
        );
      }
    }
    const expRoles = [...exp.roles].sort().join(',');
    const actRoles = [...act.roles].sort().join(',');
    if (expRoles !== actRoles) {
      errors.push(`${key}: roles esperado [${expRoles}] obtuvo [${actRoles}]`);
    }
  }
  const expKeys = new Set(expected.map(policyKey));
  for (const p of live) {
    if (!expKeys.has(policyKey(p))) {
      errors.push(`política extra ${p.table}.${p.polname}`);
    }
  }
  if (errors.length) {
    throw new Error(`RLS no coincide con develop: ${errors.join('; ')}`);
  }
}

export async function assertDatabaseAppPoliciesFidelity(client: SqlClient): Promise<void> {
  const live = await fetchAppSchemaPolicies(client);
  assertAppPoliciesMatchDevelopSnapshot(live);
}
