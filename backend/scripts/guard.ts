/**
 * Barreras para scripts de datos y aprovisionamiento (docs/seed-data.md, docs/deployment.md §7).
 * Falla cerrado antes de construir clientes pg cuando la configuración es ambigua o el destino no está permitido.
 */
import {
  assertSameDatabaseInstallation,
  normalizeDatabaseUrl,
  parseDatabaseTarget,
  redactDatabaseUrl,
} from './database-url.js';

const ALLOWED_APP_ENVS = new Set(['dev', 'test']);

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio para esta operación`);
  return value;
}

function parseList(name: string): string[] {
  const raw = process.env[name];
  if (raw === undefined) return [];
  if (name === 'SEED_FORBIDDEN_HOSTS' && (raw.trim() === '' || raw.trim() === '-')) return [];
  return raw
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
}

function requireForbiddenHostsConfigured(): void {
  if (process.env.SEED_FORBIDDEN_HOSTS === undefined) {
    throw new Error(
      'SEED_FORBIDDEN_HOSTS debe estar definido ("-" si no hay hosts extra en lista)',
    );
  }
}

function assertImplicitStagingBlocked(host: string): void {
  if (process.env.SEED_ALLOW_REMOTE === '1') return;
  if (/staging/i.test(host) || host.endsWith('.supabase.co')) {
    throw new Error(`Host de staging/remoto rechazado (use SEED_ALLOW_REMOTE=1): ${host}`);
  }
}

function parseAllowedDatabases(): string[] {
  return parseList('SEED_ALLOWED_DATABASES');
}

function parseAllowedPorts(): string[] {
  const ports = parseList('SEED_ALLOWED_PORTS');
  return ports.length > 0 ? ports : ['5432', '54320', '54329'];
}

/** Aborta en producción o APP_ENV ausente/inválido. */
export function assertNonProduction(): void {
  const appEnv = process.env.APP_ENV?.trim();
  if (!appEnv) {
    throw new Error(
      'APP_ENV es obligatorio (dev|test); no ejecutar scripts de datos sin entorno explícito',
    );
  }
  if (appEnv === 'prod') throw new Error('Prohibido en APP_ENV=prod');
  if (appEnv === 'staging' && process.env.SEED_ALLOW_STAGING !== '1') {
    throw new Error(
      'APP_ENV=staging requiere SEED_ALLOW_STAGING=1 explícito para scripts de datos',
    );
  }
  if (appEnv === 'staging' && process.env.SEED_ALLOW_STAGING === '1') return;
  if (!ALLOWED_APP_ENVS.has(appEnv)) {
    throw new Error(`APP_ENV=${appEnv} no permitido para scripts de datos`);
  }
}

export type ResolvedDatabaseUrl = {
  envVar: string;
  url: string;
  target: ReturnType<typeof parseDatabaseTarget>;
};

function assertHostAllowed(
  target: ReturnType<typeof parseDatabaseTarget>,
  denylist: string[],
): void {
  requireForbiddenHostsConfigured();
  assertImplicitStagingBlocked(target.host);
  if (denylist.includes(target.host)) {
    throw new Error(`Host prohibido (${target.host})`);
  }
  const allowedHosts = parseList('SEED_ALLOWED_HOSTS');
  if (allowedHosts.length === 0) {
    throw new Error('SEED_ALLOWED_HOSTS debe listar al menos un host permitido (fail closed)');
  }
  if (!allowedHosts.includes(target.host)) {
    throw new Error(
      `Host no autorizado: ${target.host} (destino ${redactDatabaseUrl(`postgres://${target.user}@${target.host}/${target.database}`)})`,
    );
  }
  const allowedDbs = parseAllowedDatabases();
  if (allowedDbs.length === 0) {
    throw new Error('SEED_ALLOWED_DATABASES debe listar al menos una base permitida (fail closed)');
  }
  if (!allowedDbs.includes(target.database)) {
    throw new Error(`Base de datos no autorizada: ${target.database}`);
  }
  const allowedPorts = parseAllowedPorts();
  if (!allowedPorts.includes(target.port)) {
    throw new Error(`Puerto no autorizado: ${target.port}`);
  }
}

function collectDefinedUrls(envVars: string[]): { envVar: string; url: string }[] {
  const found: { envVar: string; url: string }[] = [];
  for (const envVar of envVars) {
    const raw = process.env[envVar]?.trim();
    if (!raw) continue;
    found.push({ envVar, url: normalizeDatabaseUrl(raw) });
  }
  return found;
}

/** Resuelve URL y valida destino antes de `new pg.Client` / Pool. */
export function resolveGuardedDatabaseUrl(
  envVars: string[],
  opts?: { requiredUser?: string; allowUsers?: string[] },
): ResolvedDatabaseUrl {
  assertNonProduction();
  const denylist = parseList('SEED_FORBIDDEN_HOSTS');
  const found = collectDefinedUrls(envVars);
  if (found.length === 0) {
    throw new Error(`Ninguna de [${envVars.join(', ')}] está definida`);
  }
  if (found.length > 1) {
    const refs = found.map((f) => parseDatabaseTarget(f.url));
    const base = refs[0]!;
    for (let i = 1; i < refs.length; i++) {
      const r = refs[i]!;
      if (r.host !== base.host || r.port !== base.port || r.database !== base.database) {
        throw new Error(
          `Configuración contradictoria entre ${found[0]!.envVar} y ${found[i]!.envVar} (misma instalación exigida)`,
        );
      }
    }
  }
  const chosen = found[0]!;
  const target = parseDatabaseTarget(chosen.url);
  assertHostAllowed(target, denylist);
  if (opts?.requiredUser && target.user !== opts.requiredUser) {
    throw new Error(
      `${chosen.envVar} debe usar el rol ${opts.requiredUser} (usuario=${target.user})`,
    );
  }
  if (opts?.allowUsers && !opts.allowUsers.includes(target.user)) {
    throw new Error(`${chosen.envVar}: rol ${target.user} no permitido`);
  }
  return { envVar: chosen.envVar, url: chosen.url, target };
}

export type SeedGuardExpectation = {
  url: string;
  expectedSessionRole: string;
  ephemeralMarker: string;
  harnessRunId: string;
  expectedDatabase: string;
};

const SEED_WRITER_ROLES = ['fabsoft_seed_writer', 'fabsoft_provisioner', 'fabsoft_owner'] as const;

/** Validación estática para seed: no abre conexión. */
export function assertSeedConfiguration(): SeedGuardExpectation {
  assertNonProduction();
  const ephemeralMarker = requireEnv('SEED_EPHEMERAL_MARKER');
  const harnessRunId = requireEnv('SEED_HARNESS_RUN_ID');
  const defined = collectDefinedUrls(['SEED_DATABASE_URL', 'DATABASE_MIGRATION_URL']);
  if (defined.length === 0) {
    throw new Error('SEED_DATABASE_URL o DATABASE_MIGRATION_URL es obligatorio');
  }
  if (defined.length > 1) {
    assertSameDatabaseInstallation(defined[0]!.url, defined[1]!.url);
  }
  const resolved = resolveGuardedDatabaseUrl(
    defined.map((d) => d.envVar),
    { allowUsers: [...SEED_WRITER_ROLES] },
  );
  const expectedSessionRole = requireEnv('SEED_SESSION_ROLE');
  if (!SEED_WRITER_ROLES.includes(expectedSessionRole as (typeof SEED_WRITER_ROLES)[number])) {
    throw new Error(`SEED_SESSION_ROLE=${expectedSessionRole} no autorizado para fixtures`);
  }
  if (resolved.target.user !== expectedSessionRole) {
    throw new Error(
      `URL de seed usa ${resolved.target.user} pero SEED_SESSION_ROLE=${expectedSessionRole}`,
    );
  }
  if (process.argv.includes('--reset') && process.env.SEED_ALLOW_RESET !== '1') {
    throw new Error('seed --reset requiere SEED_ALLOW_RESET=1 y destino efímero verificado');
  }
  return {
    url: resolved.url,
    expectedSessionRole,
    ephemeralMarker,
    harnessRunId,
    expectedDatabase: resolved.target.database,
  };
}

export type SessionIdentity = {
  sessionUser: string;
  currentUser: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcanlogin: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  memberOf: string[];
  adminOf: string[];
  canSetRoleOwner: boolean;
  canSetRoleMigrator: boolean;
};

export async function probeSetRole(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
  role: string,
): Promise<boolean> {
  await query('begin');
  try {
    await query(`set local role ${role}`);
    return true;
  } catch {
    return false;
  } finally {
    await query('rollback');
  }
}

/** Tras conectar: verifica marcador efímero y atributos LOGIN reales. */
export async function loadSessionIdentity(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
): Promise<SessionIdentity> {
  const { rows } = await query(
    `select session_user::text as session_user,
            current_user::text as current_user,
            r.rolsuper, r.rolbypassrls, r.rolcanlogin, r.rolcreaterole, r.rolcreatedb,
            coalesce(array_agg(distinct m.roleid::regrole::text) filter (where m.roleid is not null), '{}') as member_of,
            coalesce(array_agg(distinct m.roleid::regrole::text) filter (where m.admin_option), '{}') as admin_of
     from pg_catalog.pg_roles r
     left join pg_catalog.pg_auth_members m on m.member = r.oid
     where r.rolname = session_user::name
     group by r.rolname, session_user, current_user, r.rolsuper, r.rolbypassrls, r.rolcanlogin,
              r.rolcreaterole, r.rolcreatedb`,
  );
  const row = rows[0];
  if (!row) throw new Error('No se pudo leer identidad de sesión');
  const canSetRoleOwner = await probeSetRole(query, 'fabsoft_owner');
  const canSetRoleMigrator = await probeSetRole(query, 'fabsoft_migrator');
  return {
    sessionUser: String(row.session_user),
    currentUser: String(row.current_user),
    rolsuper: Boolean(row.rolsuper),
    rolbypassrls: Boolean(row.rolbypassrls),
    rolcanlogin: Boolean(row.rolcanlogin),
    rolcreaterole: Boolean(row.rolcreaterole),
    rolcreatedb: Boolean(row.rolcreatedb),
    memberOf: Array.isArray(row.member_of) ? row.member_of.map(String) : [],
    adminOf: Array.isArray(row.admin_of) ? row.admin_of.map(String) : [],
    canSetRoleOwner,
    canSetRoleMigrator,
  };
}

export async function assertEphemeralMarker(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
  expected: string,
): Promise<void> {
  const { rows } = await query(`select current_setting('fabsoft.seed_ephemeral', true) as marker`);
  const marker = rows[0]?.marker ? String(rows[0].marker) : '';
  if (!marker || marker !== expected) {
    throw new Error(
      'Marcador efímero fabsoft.seed_ephemeral no coincide con SEED_EPHEMERAL_MARKER',
    );
  }
}

export async function assertHarnessProvenance(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
  expected: { marker: string; runId: string; database: string },
): Promise<void> {
  const { rows: dbRows } = await query(`select current_database()::text as db`);
  const db = String(dbRows[0]?.db ?? '');
  if (db !== expected.database) {
    throw new Error(`Base de datos inesperada: ${db} (esperada ${expected.database})`);
  }
  const { rows } = await query(
    `select run_id, marker from fabsoft_harness.ephemeral_provenance where run_id = $1`,
    [expected.runId],
  );
  if (rows.length !== 1) {
    throw new Error('Procedencia efímera del harness no encontrada (fail closed)');
  }
  const marker = String(rows[0]!.marker);
  if (marker !== expected.marker) {
    throw new Error('Marcador en fabsoft_harness.ephemeral_provenance no coincide');
  }
}

/** Verificación post-conexión para seed (identidad + procedencia). */
export async function assertSeedSession(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
  expected: SeedGuardExpectation,
): Promise<void> {
  const identity = await loadSessionIdentity(query);
  if (identity.sessionUser !== expected.expectedSessionRole) {
    throw new Error(
      `Seed: session_user=${identity.sessionUser} distinto del rol harness ${expected.expectedSessionRole}`,
    );
  }
  if (identity.currentUser !== identity.sessionUser) {
    throw new Error(`Seed: current_user (${identity.currentUser}) distinto de session_user`);
  }
  const harnessSuperuserOk =
    process.env.SEED_ALLOW_HARNESS_SUPERUSER === '1' &&
    expected.expectedDatabase.endsWith('_test') &&
    expected.expectedDatabase.includes('fabsoft');
  if (identity.rolsuper && !harnessSuperuserOk) {
    throw new Error('Seed: superusuario sólo permitido en harness de test explícito');
  }
  if (
    (identity.rolcreaterole || identity.rolcreatedb || identity.rolbypassrls) &&
    !(identity.rolsuper && harnessSuperuserOk)
  ) {
    throw new Error('Seed: rol con privilegios de escalación no permitidos');
  }
  await assertEphemeralMarker(query, expected.ephemeralMarker);
  await assertHarnessProvenance(query, {
    marker: expected.ephemeralMarker,
    runId: expected.harnessRunId,
    database: expected.expectedDatabase,
  });
}

export function assertMigratorBootstrapExpectation(identity: SessionIdentity): void {
  if (identity.sessionUser !== 'fabsoft_migrator') {
    throw new Error(`Se esperaba fabsoft_migrator, obtuvo ${identity.sessionUser}`);
  }
  if (
    identity.rolsuper ||
    identity.rolbypassrls ||
    identity.rolcreaterole ||
    identity.rolcreatedb
  ) {
    throw new Error('Migrator con atributos de escalación inaceptables');
  }
  if (!identity.rolcanlogin) throw new Error('Migrator debe ser LOGIN');
  if (identity.canSetRoleOwner) throw new Error('Migrator no debe poder SET ROLE fabsoft_owner');
  if (identity.adminOf.length > 0) {
    throw new Error(`Migrator no debe tener ADMIN OPTION: ${identity.adminOf.join(',')}`);
  }
}
