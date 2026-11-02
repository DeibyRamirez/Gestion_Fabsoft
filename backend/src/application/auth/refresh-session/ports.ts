import type { AuditWriter } from '../../shared/ports.js';
import type { AuthUser, NewRefreshToken, RevokeReason, StoredRefreshToken } from '../ports.js';

export interface RefreshSessionRepository {
  /** Bloquea la fila (FOR UPDATE) para serializar rotaciones concurrentes. */
  findByHashForUpdate(tokenHash: string): Promise<StoredRefreshToken | null>;
  loadUser(userId: string): Promise<AuthUser | null>;
  rotate(oldTokenId: string, replacement: NewRefreshToken, at: Date): Promise<void>;
  revokeFamily(familyId: string, reason: RevokeReason, at: Date): Promise<void>;
}

export interface RefreshSessionRepos {
  refresh: RefreshSessionRepository;
  audit: AuditWriter;
}
