import type { AuthUnitOfWork, Clock } from '../../shared/ports.js';
import type { IdempotencyPurgeRepository } from './ports.js';

/**
 * Purga de claves de idempotencia vencidas. La UoW inyectada corre en contexto system/worker
 * (única política DELETE de 0003). Pensado para un cron pg-boss del worker.
 */
export class PurgeIdempotencyKeys {
  constructor(
    private readonly uow: AuthUnitOfWork<{ idempotency: IdempotencyPurgeRepository }>,
    private readonly clock: Clock,
  ) {}
  execute(requestId: string): Promise<number> {
    return this.uow.run(requestId, ({ idempotency }) => idempotency.purgeExpired(this.clock.now()));
  }
}
