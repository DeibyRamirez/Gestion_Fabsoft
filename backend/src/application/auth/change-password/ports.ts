import type { SessionRevocationRepository } from '../../users/shared/ports.js';
import type { AuthUserWithSecret } from '../ports.js';

export interface ChangePasswordRepository {
  /** Hash vía app.auth_password_hash (permitido para el propio usuario, 0003). */
  loadWithSecret(userId: string): Promise<AuthUserWithSecret | null>;
  updatePassword(userId: string, passwordHash: string, at: Date): Promise<void>;
}

export interface ChangePasswordRepos {
  password: ChangePasswordRepository;
  sessions: SessionRevocationRepository;
}
