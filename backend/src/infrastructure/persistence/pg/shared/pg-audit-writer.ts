import type { AuditEntry, AuditWriter } from '../../../../application/shared/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

const SECRET_KEYS =
  /^(password|passwordhash|password_hash|apikey|keyhash|key_hash|token.*|secret.*)$/i;

/** Redacta secretos de forma recursiva (T-RN13-03). */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[REDACTED]' : redact(v)]),
    );
  }
  return value;
}

/** Inserta en audit_logs sin RETURNING (ADR-004: integraciones no tienen SELECT). */
export class PgAuditWriter implements AuditWriter {
  constructor(private readonly tx: Tx) {}

  async write(e: AuditEntry): Promise<void> {
    await this.tx.query(
      `insert into app.audit_logs (actor_type, actor_user_id, action, resource_type, resource_id, changes, request_id, ip)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        e.actor.type,
        e.actor.type === 'user' ? e.actor.userId : null,
        e.action,
        e.resourceType,
        e.resourceId,
        e.changes ? JSON.stringify(redact(e.changes)) : null,
        e.requestId,
        e.ip ?? null,
      ],
    );
  }
}
