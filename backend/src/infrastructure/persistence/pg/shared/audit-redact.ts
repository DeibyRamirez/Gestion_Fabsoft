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

/** Redacta secretos de forma recursiva (defensa adicional a app.audit_write). */
export function redact(value: unknown, allowlist?: readonly string[] | null): unknown {
  if (value === null || value === undefined) return value;
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
      if (v !== null && typeof v === 'object') {
        out[k] = redact(v, allowlist);
      } else if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
        out[k] = v;
      }
    }
    return out;
  }
  throw new TypeError(`audit redact: tipo escalar inesperado ${typeof value}`);
}

function redactArrayEntry(entry: unknown, allowlist?: readonly string[] | null): unknown {
  if (entry !== null && typeof entry === 'object') return redact(entry, allowlist);
  if (typeof entry === 'string' && JWT_IN_STRING.test(entry)) return '[REDACTED]';
  if (entry === null || ['string', 'number', 'boolean'].includes(typeof entry)) return entry;
  throw new TypeError(`audit redact: elemento de arreglo inesperado ${typeof entry}`);
}
