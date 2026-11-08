/**
 * Sólo dev/test: habilita LOGIN de fabsoft_app, fabsoft_worker y fabsoft_bootstrap (las migraciones los crean NOLOGIN)
 * con las contraseñas de DATABASE_URL y WORKER_DATABASE_URL. Usa DATABASE_MIGRATION_URL.
 */
import pg from 'pg';
import { assertNonProduction, resolveGuardedDatabaseUrl } from './guard.js';

assertNonProduction();
const { url: owner } = resolveGuardedDatabaseUrl(
  ['DATABASE_PROVISION_URL', 'DATABASE_MIGRATION_URL'],
  { allowUsers: ['fabsoft_owner', 'postgres', 'fabsoft_provisioner'] },
);
const client = new pg.Client({ connectionString: owner });
await client.connect();
try {
  for (const [role, envVar] of [
    ['fabsoft_app', 'DATABASE_URL'],
    ['fabsoft_worker', 'WORKER_DATABASE_URL'],
    ['fabsoft_bootstrap', 'BOOTSTRAP_DATABASE_URL'],
  ] as const) {
    const raw = process.env[envVar];
    if (!raw) continue;
    const url = new URL(raw);
    if (decodeURIComponent(url.username).split('.')[0] !== role)
      throw new Error(`${envVar} debe usar el rol ${role}`);
    const password = decodeURIComponent(url.password);
    const quoted = (await client.query<{ q: string }>('select quote_literal($1) as q', [password]))
      .rows[0]!.q;
    await client.query(`alter role ${role} login password ${quoted}`);
    console.log(`${role}: login habilitado`);
  }
} finally {
  await client.end();
}
