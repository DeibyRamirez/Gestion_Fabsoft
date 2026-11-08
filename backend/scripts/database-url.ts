/** Utilidades para URLs de Postgres (sin secretos en errores ni logs). */

export type DatabaseTarget = {
  host: string;
  port: string;
  database: string;
  user: string;
};

const ALLOWED_SCHEMES = new Set(['postgres:', 'postgresql:']);

/** Parámetros de URI que alteran host/puerto/BD/usuario y se rechazan (fail closed). */
const FORBIDDEN_QUERY_KEYS = new Set([
  'host',
  'hostname',
  'port',
  'dbname',
  'database',
  'user',
  'username',
]);

export function parseDatabaseTarget(url: string): DatabaseTarget {
  const canonical = normalizeDatabaseUrl(url);
  const parsed = new URL(canonical);
  const pathSegs = parsed.pathname.replace(/^\//, '').split('/').filter(Boolean);
  if (pathSegs.length !== 1) {
    throw new Error('URL de base de datos debe tener exactamente un segmento de nombre de base');
  }
  const database = pathSegs[0]!;
  const user = decodeURIComponent(parsed.username || '');
  if (!user) throw new Error('URL de base de datos sin usuario LOGIN');
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database,
    user,
  };
}

/**
 * Valida protocolo, rechaza overrides peligrosos en query string y devuelve
 * una cadena de conexión canónica para `pg` (sin reordenar credenciales).
 */
export function normalizeDatabaseUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('URL de base de datos inválida');
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error(`Protocolo no permitido: ${parsed.protocol}`);
  }
  for (const key of parsed.searchParams.keys()) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_QUERY_KEYS.has(lower)) {
      throw new Error(`Parámetro de conexión no permitido en URL: ${key}`);
    }
  }
  return parsed.toString();
}

export function assertSameDatabaseInstallation(a: string, b: string): void {
  const ta = parseDatabaseTarget(a);
  const tb = parseDatabaseTarget(b);
  if (ta.host !== tb.host || ta.port !== tb.port || ta.database !== tb.database) {
    throw new Error(
      `URLs deben apuntar a la misma instalación: ${ta.host}:${ta.port}/${ta.database} vs ${tb.host}:${tb.port}/${tb.database}`,
    );
  }
}

/** Oculta contraseña y userinfo en mensajes de error. */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(normalizeDatabaseUrl(url));
    const user = decodeURIComponent(parsed.username || '');
    const safeUser = user ? `${user}@` : '';
    const db = parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
    parsed.password = '';
    return `postgres://${safeUser}${parsed.hostname}:${parsed.port || '5432'}/${db}`;
  } catch {
    return '<url-inválida>';
  }
}

export function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

export function buildConnectionString(target: DatabaseTarget, password?: string): string {
  const encUser = encodeURIComponent(target.user);
  const auth = password ? `${encUser}:${encodeURIComponent(password)}` : encUser;
  return `postgres://${auth}@${target.host}:${target.port}/${encodeURIComponent(target.database)}?sslmode=disable`;
}
