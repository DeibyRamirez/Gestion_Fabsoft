import type {
  CleanupResult,
  MaintenanceRepository,
} from '../../../../application/maintenance/cleanup/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

export class PgMaintenanceRepository implements MaintenanceRepository {
  constructor(private readonly tx: Tx) {}

  async cleanup(now: Date, refreshTokenCutoff: Date): Promise<CleanupResult> {
    const idempotency = await this.tx.query(
      `delete from app.idempotency_keys where expires_at < $1`,
      [now],
    );
    const refreshTokens = await this.tx.query(
      `delete from app.refresh_tokens where expires_at < $1`,
      [refreshTokenCutoff],
    );
    return {
      idempotencyKeys: idempotency.rowCount ?? 0,
      refreshTokens: refreshTokens.rowCount ?? 0,
    };
  }
}
