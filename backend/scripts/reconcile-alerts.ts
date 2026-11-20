/** Ejecuta `alerts.reconcile` en línea (mismo caso de uso que usará el worker). */
import { ReconcileAlerts } from '../src/application/alerts/reconcile-alerts/use-case.js';
import { buildPgInfra } from '../src/composition/pg-infra.js';
import { loadEnv } from '../src/infrastructure/config/env.js';

const infra = await buildPgInfra(loadEnv(process.env));
try {
  const result = await new ReconcileAlerts(infra.workerUow, infra.clock).execute(
    'script:alerts-reconcile',
  );
  console.log(JSON.stringify({ job: 'alerts.reconcile', ...result }));
} finally {
  await infra.close();
}
