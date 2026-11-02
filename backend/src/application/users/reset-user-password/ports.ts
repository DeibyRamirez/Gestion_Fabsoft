import type { AuditWriter } from '../../shared/ports.js';
import type { SessionRevocationRepository } from '../shared/ports.js';

export interface ResetUserPasswordRepository {
  /** Fija hash temporal y must_change_password=true; false si no existe. */
  setTemporaryPassword(id: string, passwordHash: string, updatedBy: string): Promise<boolean>;
}

export interface ResetUserPasswordRepos {
  userPasswordReset: ResetUserPasswordRepository;
  audit: AuditWriter;
  sessions: SessionRevocationRepository;
}
