import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { Clock, UnitOfWork } from '../../shared/ports.js';
import type { MarkNotificationReadRepos } from './ports.js';

export class MarkNotificationRead {
  constructor(
    private readonly uow: UnitOfWork<MarkNotificationReadRepos>,
    private readonly clock: Clock,
  ) {}

  async execute(actor: UserActor, id: string): Promise<void> {
    requireRole(actor, 'admin', 'operator');
    await this.uow.run(actor, async ({ notificationsRead }) => {
      const marked = await notificationsRead.markRead(id, actor.userId, this.clock.now());
      if (marked) return;
      const current = await notificationsRead.findById(id);
      if (
        !current ||
        current.recipient.id !== actor.userId ||
        current.channel !== 'in_app' ||
        current.status !== 'enviada'
      ) {
        throw new ApplicationError('not_found', 'Notificación no encontrada');
      }
    });
  }
}
