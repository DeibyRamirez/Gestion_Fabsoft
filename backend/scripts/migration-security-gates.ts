import pg from 'pg';
import { normalizeDatabaseUrl } from './database-url.js';

export async function assertNoSecurityDefinerPublicExecute(databaseUrl: string): Promise<void> {
  const c = new pg.Client({ connectionString: normalizeDatabaseUrl(databaseUrl) });
  await c.connect();
  try {
    const { rows } = await c.query<{ sig: string }>(
      `select p.proname::text || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' as sig
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.prosecdef
         and has_function_privilege('public', p.oid, 'EXECUTE')`,
    );
    if (rows.length > 0) {
      throw new Error(
        `SECURITY DEFINER en app con EXECUTE para PUBLIC (0006+ gate): ${rows.map((r) => r.sig).join(', ')}`,
      );
    }
  } finally {
    await c.end();
  }
}
