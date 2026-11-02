import type { AuthUser } from '../ports.js';

export interface AuthenticateRepository {
  loadUser(userId: string): Promise<AuthUser | null>;
}

export interface AuthenticateRepos {
  authenticate: AuthenticateRepository;
}
