/**
 * Pasada única del worker para ejecución programada (GitHub Actions u otro cron).
 * No usa pg-boss: ejecuta los mismos casos de uso de forma idempotente y termina.
 * Mantiene el rol `fabsoft_worker` y la conexión directa a Postgres.
 */
import { randomUUID } from 'node:crypto';
import { CleanupMaintenance } from '../src/application/maintenance/cleanup/use-case.js';
import { ReconcileAlerts } from '../src/application/alerts/reconcile-alerts/use-case.js';
import { DispatchNotifications } from '../src/application/notifications/dispatch-notifications/use-case.js';
import { ExpireSubscriptions } from '../src/application/subscriptions/expire-subscriptions/use-case.js';
import { buildWorkerInfra } from '../src/composition/worker-infra.js';
import { loadWorkerEnv } from '../src/infrastructure/config/worker-env.js';
import { createEmailSender } from '../src/infrastructure/email/create-email-sender.js';

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));

const env = loadWorkerEnv();
const infra = await buildWorkerInfra(env);
const emailSender = createEmailSender(env, log);
const requestId = randomUUID();

try {
  const expire = new ExpireSubscriptions(infra.workerUow, infra.clock);
  const reconcile = new ReconcileAlerts(infra.workerUow, infra.clock);
  const dispatch = new DispatchNotifications(
    infra.workerUow,
    emailSender,
    infra.clock,
    env.WORKER_BATCH_SIZE,
    env.FRONTEND_URL,
  );
  const cleanup = new CleanupMaintenance(infra.workerUow, infra.clock);

  const results = {
    expire: await expire.execute(`${requestId}:expire`),
    reconcile: await reconcile.execute(`${requestId}:reconcile`),
    dispatch: await dispatch.execute(`${requestId}:dispatch`),
    cleanup: await cleanup.execute(`${requestId}:cleanup`),
  };

  log({ level: 'info', msg: 'worker.tick.completed', requestId, results });
} catch (error) {
  log({
    level: 'error',
    msg: 'worker.tick.failed',
    requestId,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
} finally {
  await infra.close();
}
