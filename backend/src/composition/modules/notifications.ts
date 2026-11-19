import { ListNotifications } from '../../application/notifications/list-notifications/use-case.js';
import { MarkNotificationRead } from '../../application/notifications/mark-notification-read/use-case.js';
import { RetryNotification } from '../../application/notifications/retry-notification/use-case.js';
import type { Infra } from '../infra.js';

export function notificationsModule(infra: Infra) {
  return {
    listNotifications: new ListNotifications(infra.userUow),
    markNotificationRead: new MarkNotificationRead(infra.userUow, infra.clock),
    retryNotification: new RetryNotification(infra.userUow, infra.clock),
  };
}
