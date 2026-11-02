import type { AuditWriter } from '../../shared/ports.js';
import type { AuthUserWithSecret, NewRefreshToken } from '../ports.js';

export interface LoginRepository {
  findByEmail(email: string): Promise<AuthUserWithSecret | null>;
  recordSuccessfulLogin(userId: string, at: Date): Promise<void>;
  createRefreshToken(token: NewRefreshToken): Promise<void>;
}

export interface LoginRepos {
  login: LoginRepository;
  audit: AuditWriter;
}
