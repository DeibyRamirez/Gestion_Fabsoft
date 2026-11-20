import { toBogotaLocalDate } from '../../../domain/subscriptions/bogota-date.js';
import { addDays } from '../../../domain/subscriptions/local-date.js';
import type { AuthUnitOfWork, Clock } from '../../shared/ports.js';
import type { RenewalRequestFollowUp, ProcessRenewalRequestRepos } from './ports.js';

/** Crea la tarea y las notificaciones de una solicitud recién creada, en contexto system. */
export class ProcessRenewalRequestCreated {
  constructor(
    private readonly uow: AuthUnitOfWork<ProcessRenewalRequestRepos>,
    private readonly clock: Clock,
  ) {}

  async execute(renewalRequestId: string): Promise<RenewalRequestFollowUp> {
    const today = toBogotaLocalDate(this.clock.now());
    const dueDate = addDays(today, 2);
    return this.uow.run(renewalRequestId, async ({ renewalRequestProcess }) => {
      const context = await renewalRequestProcess.findContext(renewalRequestId);
      if (!context) return { taskId: null, notifications: 0 };
      return renewalRequestProcess.createFollowUp(context, dueDate);
    });
  }
}
