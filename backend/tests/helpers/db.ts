import pg from 'pg';

function databaseName(url: string): string {
  const path = new URL(url).pathname.replace(/^\//, '');
  return path.split('/')[0] ?? '';
}

export function assertTestDatabaseUrl(url: string): void {
  const name = databaseName(url);
  if (!name.endsWith('_test')) {
    throw new Error(`resetDatabase() rechazado: la base "${name}" debe terminar en _test`);
  }
}

export const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;
export const appDatabaseUrl = process.env.TEST_DATABASE_URL;

export function dbTestsConfigured(): boolean {
  return Boolean(migrationUrl && appDatabaseUrl);
}

export function assertDbTestsRequired(): void {
  if (process.env.REQUIRE_DB_TESTS === '1' && !dbTestsConfigured()) {
    throw new Error(
      'REQUIRE_DB_TESTS=1 pero faltan TEST_DATABASE_MIGRATION_URL o TEST_DATABASE_URL',
    );
  }
}

/** Comprueba que la conexión es fabsoft_app sin privilegios de bypass. */
export async function assertFabsoftAppSession(client: pg.PoolClient): Promise<void> {
  const { rows } = await client.query<{
    session_user: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(`select session_user::text as session_user,
             r.rolsuper,
             r.rolbypassrls
      from pg_catalog.pg_roles r
      where r.rolname = session_user::name`);
  const row = rows[0];
  if (!row || row.session_user !== 'fabsoft_app') {
    throw new Error(
      `TEST_DATABASE_URL debe conectar como fabsoft_app (session_user=${row?.session_user ?? 'desconocido'})`,
    );
  }
  if (row.rolsuper) {
    throw new Error('fabsoft_app no debe ser superusuario (rolsuper=true)');
  }
  if (row.rolbypassrls) {
    throw new Error('fabsoft_app no debe tener BYPASSRLS');
  }
}

let ownerPool: pg.Pool | undefined;
let appPool: pg.Pool | undefined;
let appPoolReady: Promise<void> | undefined;

export function getOwnerPool(): pg.Pool {
  if (!migrationUrl) throw new Error('TEST_DATABASE_MIGRATION_URL no definido');
  assertTestDatabaseUrl(migrationUrl);
  ownerPool ??= new pg.Pool({ connectionString: migrationUrl, max: 4 });
  return ownerPool;
}

function createAppPool(): pg.Pool {
  if (!appDatabaseUrl) throw new Error('TEST_DATABASE_URL no definido');
  assertTestDatabaseUrl(appDatabaseUrl);
  return new pg.Pool({ connectionString: appDatabaseUrl, max: 8 });
}

/** Verifica rol de app en la primera conexión del pool (cached). */
export async function ensureAppPoolRoleVerified(): Promise<void> {
  if (!appDatabaseUrl) throw new Error('TEST_DATABASE_URL no definido');
  appPoolReady ??= (async () => {
    appPool ??= createAppPool();
    const client = await appPool.connect();
    try {
      await assertFabsoftAppSession(client);
    } finally {
      client.release();
    }
  })();
  await appPoolReady;
}

export function getAppPool(): pg.Pool {
  if (!appPool) appPool = createAppPool();
  return appPool;
}

async function truncateAppTables(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    `select tablename from pg_tables
     where schemaname = 'app' and tablename <> 'schema_migrations'
     order by tablename`,
  );
  if (rows.length === 0) return;
  const quoted = rows.map((r) => `"app"."${r.tablename.replace(/"/g, '""')}"`).join(', ');
  await pool.query(`truncate table ${quoted} restart identity cascade`);
}

/** Trunca tablas de `app` tras validar la URL; expuesto para tests con pool simulado. */
export async function resetDatabaseWithPool(url: string, pool: pg.Pool): Promise<void> {
  assertTestDatabaseUrl(url);
  await truncateAppTables(pool);
}

/** Trunca todas las tablas de `app` (excepto schema_migrations) con el rol propietario. */
export async function resetDatabase(): Promise<void> {
  if (!migrationUrl) throw new Error('TEST_DATABASE_MIGRATION_URL no definido');
  await resetDatabaseWithPool(migrationUrl, getOwnerPool());
}

export type AppUserContext = {
  userId: string;
  role: 'admin' | 'operator' | 'client';
  clientId: string | null;
  requestId?: string;
};

/** Ejecuta consultas como `fabsoft_app` con contexto RLS de usuario. */
export async function withAppContext<T>(
  ctx: AppUserContext,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  await ensureAppPoolRoleVerified();
  const client = await getAppPool().connect();
  try {
    await assertFabsoftAppSession(client);
    await client.query('begin');
    await client.query('set local role fabsoft_app');
    await client.query(
      `select set_config('app.actor_type',$1,true), set_config('app.actor_role',$2,true),
              set_config('app.current_user_id',$3,true), set_config('app.client_id',$4,true),
              set_config('app.integration_id','',true), set_config('app.request_id',$5,true)`,
      ['user', ctx.role, ctx.userId, ctx.clientId ?? '', ctx.requestId ?? 'test'],
    );
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Inserts de preparación con contexto `system` (triggers de pricing, etc.). */
export async function withOwnerSystemContext<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getOwnerPool().connect();
  try {
    await client.query('begin');
    await client.query(
      `select set_config('app.actor_type','system',true), set_config('app.actor_role','system',true)`,
    );
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function closeTestPools(): Promise<void> {
  await ownerPool?.end();
  await appPool?.end();
  ownerPool = appPool = undefined;
  appPoolReady = undefined;
}
