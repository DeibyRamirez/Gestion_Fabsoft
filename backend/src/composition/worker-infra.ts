import type { WorkerScopeRepos } from './infra.js';
import { PgAlertSchedulingRepository } from '../infrastructure/persistence/pg/alerts/pg-alert-scheduling-repository.js';
import { PgIdempotencyPurgeRepository } from '../infrastructure/persistence/pg/maintenance/pg-idempotency-purge.js';
import { PgMaintenanceRepository } from '../infrastructure/persistence/pg/maintenance/pg-maintenance-repository.js';
import { PgNotificationDispatchRepository } from '../infrastructure/persistence/pg/notifications/pg-notification-dispatch-repository.js';
import { PgExpireSubscriptionsRepository } from '../infrastructure/persistence/pg/subscriptions/pg-expire-subscriptions-repository.js';
import { SystemClock } from '../infrastructure/clock/system-clock.js';
import type { WorkerEnv } from '../infrastructure/config/worker-env.js';
import { createPool } from '../infrastructure/db/pool.js';
import { PgSystemUnitOfWork } from '../infrastructure/db/pg-unit-of-work.js';
import { DirectPostgresProvider } from '../infrastructure/db/providers/postgres.js';
import { createWithRlsContext } from '../infrastructure/db/with-rls-context.js';
import type { AuthUnitOfWork, Clock } from '../application/shared/ports.js';

export interface WorkerInfra {
  workerUow: AuthUnitOfWork<WorkerScopeRepos>;
  clock: Clock;
  close(): Promise<void>;
}

/** Infra mínima del worker: conexión de sesión con `fabsoft_worker` (ADR-005). */
export async function buildWorkerInfra(env: WorkerEnv): Promise<WorkerInfra> {
  const settings = {
    url: env.WORKER_DATABASE_URL,
    sslMode: env.DATABASE_SSL_MODE,
    sslCa: env.DATABASE_SSL_CA,
    poolMax: env.DB_POOL_MAX,
  };
  const pool = createPool(new DirectPostgresProvider(settings));
  const withRls = createWithRlsContext(pool);
  const workerUow = new PgSystemUnitOfWork<WorkerScopeRepos>(
    withRls,
    (tx) => ({
      idempotency: new PgIdempotencyPurgeRepository(tx),
      alerts: new PgAlertSchedulingRepository(tx),
      notificationsDispatch: new PgNotificationDispatchRepository(tx),
      subscriptionsExpire: new PgExpireSubscriptionsRepository(tx),
      maintenance: new PgMaintenanceRepository(tx),
    }),
    'worker',
  );
  return {
    workerUow,
    clock: new SystemClock(),
    close: () => pool.end(),
  };
}
