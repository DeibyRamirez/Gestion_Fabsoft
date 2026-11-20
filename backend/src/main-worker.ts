import PgBoss from 'pg-boss';
import { CleanupMaintenance } from './application/maintenance/cleanup/use-case.js';
import { ReconcileAlerts } from './application/alerts/reconcile-alerts/use-case.js';
import { DispatchNotifications } from './application/notifications/dispatch-notifications/use-case.js';
import { ExpireSubscriptions } from './application/subscriptions/expire-subscriptions/use-case.js';
import type { EmailSender } from './application/notifications/shared/email-sender.js';
import { buildWorkerInfra } from './composition/worker-infra.js';
import { LogEmailSender } from './infrastructure/email/log-email-sender.js';
import { ResendEmailSender } from './infrastructure/email/resend-email-sender.js';
import { loadWorkerEnv } from './infrastructure/config/worker-env.js';

const QUEUES = {
  expire: 'subscriptions.expire',
  reconcile: 'alerts.reconcile',
  dispatch: 'notifications.dispatch',
  cleanup: 'maintenance.cleanup',
} as const;

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));

const env = loadWorkerEnv();
const infra = await buildWorkerInfra(env);
const emailSender: EmailSender =
  env.CORREO_CANAL === 'resend'
    ? new ResendEmailSender({
        apiKey: env.RESEND_API_KEY!,
        from: env.CORREO_DESDE,
        maxRps: env.RESEND_MAX_RPS,
      })
    : new LogEmailSender(log);

const expire = new ExpireSubscriptions(infra.workerUow, infra.clock);
const reconcile = new ReconcileAlerts(infra.workerUow, infra.clock);
const cleanup = new CleanupMaintenance(infra.workerUow, infra.clock);
const dispatch = new DispatchNotifications(
  infra.workerUow,
  emailSender,
  infra.clock,
  env.WORKER_BATCH_SIZE,
  env.FRONTEND_URL,
);

const ssl =
  env.DATABASE_SSL_MODE === 'disable'
    ? false
    : env.DATABASE_SSL_MODE === 'require'
      ? { rejectUnauthorized: false }
      : env.DATABASE_SSL_CA
        ? { rejectUnauthorized: true, ca: env.DATABASE_SSL_CA }
        : { rejectUnauthorized: true };

const boss = new PgBoss({
  connectionString: env.WORKER_DATABASE_URL,
  application_name: 'fabsoft-worker',
  max: env.DB_POOL_MAX,
  ssl,
});
boss.on('error', (error) =>
  log({ level: 'error', msg: 'worker.pg_boss_error', error: String(error) }),
);

await boss.start();

await boss.work(QUEUES.expire, async (job) => expire.execute(job.id));
await boss.work(QUEUES.reconcile, async (job) => reconcile.execute(job.id));
await boss.work(QUEUES.dispatch, async (job) => dispatch.execute(job.id));
await boss.work(QUEUES.cleanup, async (job) => cleanup.execute(job.id));

await boss.schedule(QUEUES.expire, '5 0 * * *', {}, { tz: env.BUSINESS_TIMEZONE });
await boss.schedule(QUEUES.reconcile, '10 0 * * *', {}, { tz: env.BUSINESS_TIMEZONE });
await boss.schedule(QUEUES.dispatch, '* * * * *', {}, { tz: env.BUSINESS_TIMEZONE });
await boss.schedule(QUEUES.cleanup, '30 3 * * *', {}, { tz: env.BUSINESS_TIMEZONE });

if (env.WORKER_RUN_ON_START) {
  for (const queue of Object.values(QUEUES)) await boss.send(queue, {});
}

log({ level: 'info', msg: 'worker.started', env: env.APP_ENV, canal: env.CORREO_CANAL });

const heartbeat = setInterval(
  () => log({ level: 'info', msg: 'worker.heartbeat', at: new Date().toISOString() }),
  60_000,
);
heartbeat.unref();

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  clearInterval(heartbeat);
  log({ level: 'info', msg: 'worker.stopping', signal });
  await boss.stop({ graceful: true, timeout: 30_000 }).catch(() => undefined);
  await infra.close();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}
