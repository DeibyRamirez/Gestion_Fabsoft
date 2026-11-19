import type { NotificationListQuery } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { NotificationView } from '../shared/notification-view.js';
import type { ListNotificationsRepos } from './ports.js';

export interface NotificationListResult {
  items: NotificationView[];
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
}

export class ListNotifications {
  constructor(private readonly uow: UnitOfWork<ListNotificationsRepos>) {}

  async execute(actor: UserActor, query: NotificationListQuery): Promise<NotificationListResult> {
    requireRole(actor, 'admin', 'operator');
    const result = await this.uow.run(actor, ({ notificationsList }) =>
      notificationsList.list({ ...query, actorUserId: actor.userId }),
    );
    return {
      ...result,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
