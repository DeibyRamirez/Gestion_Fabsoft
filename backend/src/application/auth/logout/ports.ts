import type { RevokeReason, StoredRefreshToken } from '../ports.js';

export interface LogoutRepository {
  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  revokeFamily(familyId: string, reason: RevokeReason, at: Date): Promise<void>;
}

export interface LogoutRepos {
  logout: LogoutRepository;
}
