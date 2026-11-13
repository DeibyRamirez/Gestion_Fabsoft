import type { AuditEntry, AuditWriter } from '../../../../application/shared/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';
import { redact } from './audit-redact.js';

/**
 * Auditoría en la misma transacción que la mutación (RN-13).
 * Escribe vía app.audit_write (SECURITY DEFINER); actor y request_id vienen del contexto RLS.
 */
export class PgAuditWriter implements AuditWriter {
  constructor(private readonly tx: Tx) {}

  async write(e: AuditEntry): Promise<void> {
    const changes = e.changes ? (redact(e.changes) as Record<string, unknown>) : null;
    await this.tx.query(
      `select app.audit_write($1::text, $2::text, $3::text, $4::jsonb, $5::text, $6::inet)`,
      [
        e.action,
        e.resourceType,
        e.resourceId,
        changes ? JSON.stringify(changes) : null,
        null,
        e.ip ?? null,
      ],
    );
  }
}
