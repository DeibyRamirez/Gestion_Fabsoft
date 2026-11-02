import type { Role, UserStatus } from '../../../domain/users/role.js';
import type { AuditWriter } from '../../shared/ports.js';
import type { SessionRevocationRepository } from '../shared/ports.js';
import type { UserView } from '../shared/user-view.js';

export interface UserPatch {
  fullName?: string;
  role: Role;
  clientId: string | null;
  status: UserStatus;
  updatedBy: string;
}

export interface UpdateUserRepository {
  /** SELECT ... FOR UPDATE */
  loadForUpdate(id: string): Promise<UserView | null>;
  countActiveAdmins(): Promise<number>;
  save(id: string, patch: UserPatch): Promise<UserView | 'unknown_client'>;
}

export interface UpdateUserRepos {
  userUpdate: UpdateUserRepository;
  audit: AuditWriter;
  sessions: SessionRevocationRepository;
}
