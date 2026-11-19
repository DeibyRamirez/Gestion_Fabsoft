import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { AuditWriter, Clock, UnitOfWork } from '../../shared/ports.js';
import type { NotificationView } from '../shared/notification-view.js';
import type { RetryNotificationRepos } from './ports.js';

type RetryNotificationUow = RetryNotificationRepos & { audit: AuditWriter };

export class RetryNotification {
  constructor(
    private readonly uow: UnitOfWork<RetryNotificationUow>,
    private readonly clock: Clock,
  ) {}

  async execute(actor: UserActor, id: string): Promise<NotificationView> {
    requireRole(actor, 'admin');
    return this.uow.run(actor, async ({ notificationsRetry, audit }) => {
      const current = await notificationsRetry.loadForRetry(id);
      if (!current) throw new ApplicationError('not_found', 'Notificación no encontrada');
      if (current.notification.status !== 'failed') {
        throw new ApplicationError(
          'invalid_state_transition',
          'Sólo se reintenta una notificación fallida',
        );
      }
      if (current.obsolete) {
        throw new ApplicationError(
          'notification_obsolete',
          'La notificación ya no corresponde al periodo vigente',
        );
      }

      const restarted = await notificationsRetry.restart(id, this.clock.now());
      if (!restarted) throw new ApplicationError('not_found', 'Notificación no encontrada');
      await audit.write({
        actor: { type: 'user', userId: actor.userId },
        action: 'notification.retried',
        resourceType: 'notification',
        resourceId: id,
        changes: {
          before: { status: current.notification.status },
          after: { status: restarted.status },
        },
        requestId: actor.requestId,
      });
      return restarted;
    });
  }
}
