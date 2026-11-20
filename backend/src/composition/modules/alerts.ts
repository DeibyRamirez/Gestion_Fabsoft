import { ListAlertRules } from '../../application/alerts/list-alert-rules/use-case.js';
import { ReconcileAlerts } from '../../application/alerts/reconcile-alerts/use-case.js';
import { UpdateAlertRule } from '../../application/alerts/update-alert-rule/use-case.js';
import type { Infra } from '../infra.js';

export function alertsModule(infra: Infra) {
  return {
    reconcileAlerts: new ReconcileAlerts(infra.workerUow, infra.clock),
    listAlertRules: new ListAlertRules(infra.userUow),
    updateAlertRule: new UpdateAlertRule(infra.userUow),
  };
}
