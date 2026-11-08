/** Utilidades para URLs de Postgres (sin secretos en errores ni logs). */

export type DatabaseTarget = {
  host: string;
  port: string;
  database: string;
  user: string;
};

export function parseDatabaseTarget(url: string): DatabaseTarget {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('URL de base de datos inválida');
  }
  const database = parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
  if (!database) throw new Error('URL de base de datos sin nombre de base');
  const user = decodeURIComponent(parsed.username || '');
  if (!user) throw new Error('URL de base de datos sin usuario LOGIN');
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database,
    user: user.split('.')[0] ?? user,
  };
}

/** Oculta contraseña y userinfo en mensajes de error. */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const user = decodeURIComponent(parsed.username || '');
    const safeUser = user ? `${user.split('.')[0] ?? user}@` : '';
    const db = parsed.pathname.replace(/^\//, '').split('/')[0] ?? '';
    return `postgres://${safeUser}${parsed.hostname}:${parsed.port || '5432'}/${db}`;
  } catch {
    return '<url-inválida>';
  }
}

export function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}
