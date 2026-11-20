import type { NotificationView } from '../shared/notification-view.js';

export interface MarkNotificationReadRepository {
  findById(id: string): Promise<NotificationView | null>;
  markRead(id: string, userId: string, readAt: Date): Promise<boolean>;
}

export interface MarkNotificationReadRepos {
  notificationsRead: MarkNotificationReadRepository;
}
