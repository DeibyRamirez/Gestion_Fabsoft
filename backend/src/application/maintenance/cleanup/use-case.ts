import type { AuthUnitOfWork, Clock } from '../../shared/ports.js';
import type { CleanupResult, MaintenanceRepos } from './ports.js';

const RETENTION_MS = 30 * 24 * 60 * 60_000;

/** Job `maintenance.cleanup` (03:30 America/Bogota). */
export class CleanupMaintenance {
  constructor(
    private readonly uow: AuthUnitOfWork<MaintenanceRepos>,
    private readonly clock: Clock,
  ) {}

  execute(requestId: string): Promise<CleanupResult> {
    const now = this.clock.now();
    return this.uow.run(requestId, ({ maintenance }) =>
      maintenance.cleanup(now, new Date(now.getTime() - RETENTION_MS)),
    );
  }
}
