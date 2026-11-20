import { NotificationListQuerySchema, type NotificationDto } from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { ListNotifications } from '../../../../application/notifications/list-notifications/use-case.js';
import type { MarkNotificationRead } from '../../../../application/notifications/mark-notification-read/use-case.js';
import type { RetryNotification } from '../../../../application/notifications/retry-notification/use-case.js';
import type { NotificationView } from '../../../../application/notifications/shared/notification-view.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface NotificationsRouteDeps {
  listNotifications: ListNotifications;
  markNotificationRead: MarkNotificationRead;
  retryNotification: RetryNotification;
}

const IdSchema = z.string().uuid();

export const toNotificationDto = (n: NotificationView): NotificationDto => ({
  id: n.id,
  notificationType: n.notificationType,
  subscriptionId: n.subscriptionId,
  renewalRequestId: n.renewalRequestId,
  taskId: n.taskId,
  ruleCode: n.ruleCode,
  periodEnd: n.periodEnd,
  channel: n.channel,
  recipient: n.recipient,
  scheduledFor: n.scheduledFor.toISOString(),
  status: n.status,
  attempts: n.attempts,
  maxAttempts: n.maxAttempts,
  nextAttemptAt: n.nextAttemptAt?.toISOString() ?? null,
  lastError: n.lastError,
  sentAt: n.sentAt?.toISOString() ?? null,
  readAt: n.readAt?.toISOString() ?? null,
  cancelReason: n.cancelReason,
  title: n.title,
});

export function notificationsRouter(
  deps: NotificationsRouteDeps,
  guards: RequestHandler[],
): Router {
  const router = Router();
  const staff = [...guards, requireRole('admin', 'operator')];
  const admin = [...guards, requireRole('admin')];

  router.get('/notifications', ...staff, async (req, res) => {
    const query = NotificationListQuerySchema.parse(req.query);
    const result = await deps.listNotifications.execute(actorOf(res), query);
    res.json({
      data: result.items.map(toNotificationDto),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
        unreadCount: result.unreadCount,
      },
    });
  });

  router.post('/notifications/:id/read', ...staff, async (req, res) => {
    await deps.markNotificationRead.execute(actorOf(res), IdSchema.parse(req.params.id));
    res.status(204).end();
  });

  router.post('/notifications/:id/retry', ...admin, async (req, res) => {
    const notification = await deps.retryNotification.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
    );
    res.json(toNotificationDto(notification));
  });

  return router;
}
