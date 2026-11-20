import type { NotificationListQuery } from '@fabsoft/shared';
import type { NotificationView } from '../shared/notification-view.js';

export interface ResolvedNotificationListQuery extends NotificationListQuery {
  actorUserId: string;
}

export interface ListNotificationsQuery {
  list(
    query: ResolvedNotificationListQuery,
  ): Promise<{ items: NotificationView[]; total: number; unreadCount: number }>;
}

export interface ListNotificationsRepos {
  notificationsList: ListNotificationsQuery;
}
