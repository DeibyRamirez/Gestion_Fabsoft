import type { AuthUser } from '../ports.js';

export interface GetMeQuery {
  findProfile(userId: string): Promise<AuthUser | null>;
}

export interface GetMeRepos {
  me: GetMeQuery;
}
