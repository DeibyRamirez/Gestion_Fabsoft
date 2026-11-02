import type { IdempotencyPurgeRepository } from '../../../../application/maintenance/purge-idempotency-keys/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

/** DELETE sólo permitido en contexto system (0003 M2: idempotency_keys_delete). */
export class PgIdempotencyPurgeRepository implements IdempotencyPurgeRepository {
  constructor(private readonly tx: Tx) {}
  async purgeExpired(now: Date): Promise<number> {
    const res = await this.tx.query(`delete from app.idempotency_keys where expires_at < $1`, [
      now,
    ]);
    return res.rowCount ?? 0;
  }
}
