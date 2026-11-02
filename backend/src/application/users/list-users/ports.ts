import type { UserListQuery } from '@fabsoft/shared';
import type { UserView } from '../shared/user-view.js';

export interface ListUsersQuery {
  list(query: UserListQuery): Promise<{ items: UserView[]; total: number }>;
}

export interface ListUsersRepos {
  usersList: ListUsersQuery;
}
