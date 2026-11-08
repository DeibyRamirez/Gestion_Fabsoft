/**
 * Barreras para scripts de datos y aprovisionamiento (docs/seed-data.md, docs/deployment.md §7).
 * Falla cerrado antes de construir clientes pg cuando la configuración es ambigua o el destino no está permitido.
 */
import { parseDatabaseTarget, redactDatabaseUrl } from './database-url.js';

const ALLOWED_APP_ENVS = new Set(['dev', 'test', 'staging']);

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio para esta operación`);
  return value;
}

function parseList(name: string): string[] {
  const raw = process.env[name];
  if (raw === undefined) return [];
  return raw
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
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
      'APP_ENV es obligatorio (dev|test|staging); no ejecutar scripts de datos sin entorno explícito',
    );
  }
  if (appEnv === 'prod') throw new Error('Prohibido en APP_ENV=prod');
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

/** Resuelve URL y valida destino antes de `new pg.Client` / Pool. */
export function resolveGuardedDatabaseUrl(
  envVars: string[],
  opts?: { requiredUser?: string; allowUsers?: string[] },
): ResolvedDatabaseUrl {
  assertNonProduction();
  const denylist = parseList('SEED_FORBIDDEN_HOSTS');
  for (const envVar of envVars) {
    const url = process.env[envVar]?.trim();
    if (!url) continue;
    const target = parseDatabaseTarget(url);
    assertHostAllowed(target, denylist);
    if (opts?.requiredUser && target.user !== opts.requiredUser) {
      throw new Error(`${envVar} debe usar el rol ${opts.requiredUser} (usuario=${target.user})`);
    }
    if (opts?.allowUsers && !opts.allowUsers.includes(target.user)) {
      throw new Error(`${envVar}: rol ${target.user} no permitido`);
    }
    return { envVar, url, target };
  }
  throw new Error(`Ninguna de [${envVars.join(', ')}] está definida`);
}

export type SeedGuardExpectation = {
  url: string;
  expectedUser: string;
  ephemeralMarker: string;
};

/** Validación estática para seed: no abre conexión. */
export function assertSeedConfiguration(): SeedGuardExpectation {
  const ephemeralMarker = requireEnv('SEED_EPHEMERAL_MARKER');
  const resolved = resolveGuardedDatabaseUrl(['SEED_DATABASE_URL', 'DATABASE_MIGRATION_URL'], {
    allowUsers: ['fabsoft_owner', 'postgres', 'fabsoft_provisioner'],
  });
  const expectedUser = resolved.target.user;
  if (!['fabsoft_owner', 'postgres', 'fabsoft_provisioner'].includes(expectedUser)) {
    throw new Error(`SEED: rol ${expectedUser} no autorizado para escritura de fixtures`);
  }
  if (process.argv.includes('--reset') && process.env.SEED_ALLOW_RESET !== '1') {
    throw new Error('seed --reset requiere SEED_ALLOW_RESET=1 y destino efímero verificado');
  }
  return { url: resolved.url, expectedUser, ephemeralMarker };
}

export type SessionIdentity = {
  sessionUser: string;
  currentUser: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcanlogin: boolean;
  memberOf: string[];
  canSetRoleOwner: boolean;
};

/** Tras conectar: verifica marcador efímero y atributos LOGIN reales. */
export async function loadSessionIdentity(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
): Promise<SessionIdentity> {
  const { rows } = await query(
    `select session_user::text as session_user,
            current_user::text as current_user,
            r.rolsuper, r.rolbypassrls, r.rolcanlogin,
            coalesce(array_agg(m.roleid::regrole::text) filter (where m.roleid is not null), '{}') as member_of
     from pg_catalog.pg_roles r
     left join pg_catalog.pg_auth_members m on m.member = r.oid
     where r.rolname = session_user::name
     group by r.rolname, session_user, current_user, r.rolsuper, r.rolbypassrls, r.rolcanlogin`,
  );
  const row = rows[0];
  if (!row) throw new Error('No se pudo leer identidad de sesión');
  let canSetRoleOwner = false;
  await query('begin');
  try {
    await query('set local role fabsoft_owner');
    canSetRoleOwner = true;
  } catch {
    canSetRoleOwner = false;
  } finally {
    await query('rollback');
  }
  return {
    sessionUser: String(row.session_user),
    currentUser: String(row.current_user),
    rolsuper: Boolean(row.rolsuper),
    rolbypassrls: Boolean(row.rolbypassrls),
    rolcanlogin: Boolean(row.rolcanlogin),
    memberOf: Array.isArray(row.member_of) ? row.member_of.map(String) : [],
    canSetRoleOwner,
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
