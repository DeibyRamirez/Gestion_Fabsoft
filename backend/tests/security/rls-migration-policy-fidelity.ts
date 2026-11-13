/**
 * Fidelidad RLS fabsoft_app ↔ definición post-migraciones (0004/0003), sin reescribir políticas en tests.
 */
import type pg from 'pg';

export type ExpectedSelectPolicy = {
  table: string;
  polname: string;
  /** Expresión USING esperada (normalizada). */
  qualIncludes: readonly string[];
  /** subcadenas que NO deben aparecer (p. ej. true suelto como política rota). */
  qualMustNotInclude?: readonly string[];
};

/** Estado canónico tras 0001–0005 (cadenas distintivas de pg_get_expr). */
export const EXPECTED_FABSOFT_APP_SELECT: ExpectedSelectPolicy[] = [
  {
    table: 'subscriptions',
    polname: 'subscriptions_select',
    qualIncludes: ['app.is_staff()', 'app.is_system()'],
    qualMustNotInclude: ['using (true)', ' is true'],
  },
  {
    table: 'client_contacts',
    polname: 'client_contacts_select',
    qualIncludes: ['app.is_staff()', 'app.integration_sees_client'],
    qualMustNotInclude: ['is_client_user()'],
  },
  {
    table: 'tasks',
    polname: 'tasks_select',
    qualIncludes: ['app.is_staff()', 'app.integration_sees_client'],
  },
  {
    table: 'notifications',
    polname: 'notifications_select',
    qualIncludes: ['app.is_staff()', 'app.is_system()'],
    qualMustNotInclude: ['using (true)', ' is true'],
  },
];

function normalizeQual(q: string | null): string {
  return (q ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

type SqlClient = Pick<pg.Client, 'query'>;

export async function fetchFabsoftAppSelectQuals(client: SqlClient): Promise<Map<string, string>> {
  const { rows } = await client.query<{ table: string; polname: string; qual: string | null }>(
    `select c.relname as table, p.polname,
            pg_get_expr(p.polqual, p.polrelid) as qual
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'app'
       and p.polcmd = 'r'
       and 'fabsoft_app' = any (
         select r.rolname::text from unnest(p.polroles) oid
         join pg_roles r on r.oid = oid
       )`,
  );
  const out = new Map<string, string>();
  for (const r of rows) {
    out.set(`${r.table}.${r.polname}`, normalizeQual(r.qual));
  }
  return out;
}

export function assertFabsoftAppPoliciesMatchMigrations(
  quals: Map<string, string>,
): void {
  const errors: string[] = [];
  for (const exp of EXPECTED_FABSOFT_APP_SELECT) {
    const key = `${exp.table}.${exp.polname}`;
    const qual = quals.get(key);
    if (qual === undefined) {
      errors.push(`falta política ${key}`);
      continue;
    }
    for (const frag of exp.qualIncludes) {
      if (!qual.includes(frag.toLowerCase())) {
        errors.push(`${key}: falta fragmento "${frag}" en ${qual}`);
      }
    }
    for (const bad of exp.qualMustNotInclude ?? []) {
      if (qual === 'true' || qual.includes(bad.toLowerCase())) {
        errors.push(`${key}: política corrupta (${qual})`);
      }
    }
  }
  if (errors.length) {
    throw new Error(`RLS no coincide con migraciones: ${errors.join('; ')}`);
  }
}

export async function assertDatabaseFabsoftAppPoliciesFidelity(client: SqlClient): Promise<void> {
  const quals = await fetchFabsoftAppSelectQuals(client);
  assertFabsoftAppPoliciesMatchMigrations(quals);
}
