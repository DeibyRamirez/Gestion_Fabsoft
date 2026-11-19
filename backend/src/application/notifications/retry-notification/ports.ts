import type { NotificationView } from '../shared/notification-view.js';

export interface NotificationForRetry {
  notification: NotificationView;
  obsolete: boolean;
}

export interface RetryNotificationRepository {
  loadForRetry(id: string): Promise<NotificationForRetry | null>;
  restart(id: string, now: Date): Promise<NotificationView | null>;
}

export interface RetryNotificationRepos {
  notificationsRetry: RetryNotificationRepository;
}
