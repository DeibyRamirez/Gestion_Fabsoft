import type { UserView } from '../shared/user-view.js';

export interface GetUserQuery {
  findById(id: string): Promise<UserView | null>;
}

export interface GetUserRepos {
  userDetail: GetUserQuery;
}
