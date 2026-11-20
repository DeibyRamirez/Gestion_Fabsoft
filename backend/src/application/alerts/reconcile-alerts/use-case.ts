import { toBogotaLocalDate } from '../../../domain/subscriptions/bogota-date.js';
import type { AuthUnitOfWork, Clock } from '../../shared/ports.js';
import type { AlertSchedulingRepos, AlertReconcileResult } from '../shared/alert-scheduling.js';

/** Job `alerts.reconcile`: mismo motor que la programación en línea (RN-08/RN-10). */
export class ReconcileAlerts {
  constructor(
    private readonly uow: AuthUnitOfWork<AlertSchedulingRepos>,
    private readonly clock: Clock,
  ) {}

  execute(requestId: string): Promise<AlertReconcileResult> {
    const today = toBogotaLocalDate(this.clock.now());
    return this.uow.run(requestId, ({ alerts }) => alerts.reconcile(today));
  }
}
