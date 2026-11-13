import pg from 'pg';
import { normalizeDatabaseUrl } from './database-url.js';

const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast'];

export async function assertNoSecurityDefinerPublicExecute(databaseUrl: string): Promise<void> {
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(databaseUrl) });
  await c.connect();
  try {
    const { rows: publicRows } = await c.query<{ label: string }>(
      `select n.nspname::text || '.' || p.proname::text || '(' ||
              pg_catalog.oidvectortypes(p.proargtypes) || ')' as label
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef
         and n.nspname <> all($1::text[])
         and has_function_privilege('public', p.oid, 'EXECUTE')`,
      [SYSTEM_SCHEMAS],
    );
    if (publicRows.length > 0) {
      throw new Error(
        `SECURITY DEFINER con EXECUTE para PUBLIC (0006+ gate): ${publicRows.map((r) => r.label).join(', ')}`,
      );
    }

    const { rows: workerBootstrap } = await c.query<{ ok: boolean }>(
      `select has_function_privilege(
         'fabsoft_worker',
         'app.bootstrap_first_admin(text,text,text)',
         'EXECUTE'
       ) as ok`,
    );
    if (workerBootstrap[0]?.ok) {
      throw new Error(
        'Gate prosecdef: fabsoft_worker no debe tener EXECUTE en app.bootstrap_first_admin',
      );
    }
  } finally {
    await c.end();
  }
}
