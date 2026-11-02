import type { UserListQuery } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { UserView } from '../shared/user-view.js';
import type { ListUsersRepos } from './ports.js';

export interface UserListResult {
  items: UserView[];
  page: number;
  pageSize: number;
  total: number;
}

export class ListUsers {
  constructor(private readonly uow: UnitOfWork<ListUsersRepos>) {}

  async execute(actor: UserActor, query: UserListQuery): Promise<UserListResult> {
    requireRole(actor, 'admin');
    const { items, total } = await this.uow.run(actor, ({ usersList }) => usersList.list(query));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
