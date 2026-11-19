import { ReconcileAlerts } from '../../application/alerts/reconcile-alerts/use-case.js';
import type { Infra } from '../infra.js';

export function alertsModule(infra: Infra) {
  return {
    reconcileAlerts: new ReconcileAlerts(infra.workerUow, infra.clock),
  };
}
