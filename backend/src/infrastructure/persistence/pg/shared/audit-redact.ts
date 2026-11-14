const SECRET_KEY =
  /^(password|passwordhash|password_hash|apikey|api_key|keyhash|key_hash|token|secret|authorization|connection_string|database_url|jwt|private_key|.*_token)$/i;
const JWT_IN_STRING = /^eyj[a-z0-9_-]*\.[a-z0-9._-]+\.[a-z0-9._-]+$/i;

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    SECRET_KEY.test(key) ||
    k.includes('password') ||
    k.includes('secret') ||
    k.includes('private_key') ||
    k.includes('jwt') ||
    k === 'pass' ||
    k === 'credentials.pass'
  );
}

function camelToSnakeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, '_$1')
    .replace(/__/g, '_')
    .toLowerCase()
    .replace(/^_/, '');
}

/** Convierte claves camelCase a snake_case antes de la allowlist SQL. */
export function normalizeAuditKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeAuditKeys(entry));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[camelToSnakeKey(k)] = normalizeAuditKeys(v);
    }
    return out;
  }
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  throw new TypeError(`audit redact: tipo escalar inesperado ${typeof value}`);
}

function redactArrayEntry(entry: unknown, allowlist?: readonly string[] | null): unknown {
  if (entry !== null && typeof entry === 'object' && !(entry instanceof Date)) {
    return redact(entry, allowlist);
  }
  if (entry instanceof Date) return entry.toISOString();
  if (typeof entry === 'string' && JWT_IN_STRING.test(entry)) return '[REDACTED]';
  if (entry === null || ['string', 'number', 'boolean'].includes(typeof entry)) return entry;
  throw new TypeError(`audit redact: elemento de arreglo inesperado ${typeof entry}`);
}

/** Redacta secretos de forma recursiva (defensa adicional a app.audit_write). */
export function redact(value: unknown, allowlist?: readonly string[] | null): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((entry) => redactArrayEntry(entry, allowlist));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(k)) {
        out[k] = '[REDACTED]';
        continue;
      }
      if (allowlist && allowlist.length > 0 && !allowlist.includes(k)) continue;
      if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
        out[k] = redact(v, allowlist);
      } else if (v instanceof Date) {
        out[k] = v.toISOString();
      } else if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
        out[k] = v;
      }
    }
    return out;
  }
  throw new TypeError(`audit redact: tipo escalar inesperado ${typeof value}`);
}

/** Normaliza claves y redacta secretos antes de enviar a app.audit_write. */
export function prepareAuditChanges(changes: unknown): unknown {
  return redact(normalizeAuditKeys(changes));
}
