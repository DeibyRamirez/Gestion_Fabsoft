const SECRET_KEYS =
  /^(password|passwordhash|password_hash|apikey|api_key|keyhash|key_hash|token.*|secret.*|authorization|connection_string|database_url)$/i;

/** Redacta secretos de forma recursiva (defensa adicional a app.audit_write). */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[REDACTED]' : redact(v)]),
    );
  }
  return value;
}
