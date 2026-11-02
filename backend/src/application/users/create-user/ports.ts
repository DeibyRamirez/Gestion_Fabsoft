import type { Role } from '../../../domain/users/role.js';
import type { AuditWriter } from '../../shared/ports.js';
import type { UserView } from '../shared/user-view.js';

export interface NewUser {
  email: string;
  fullName: string;
  role: Role;
  clientId: string | null;
  passwordHash: string;
  createdBy: string;
}

export type CreateUserOutcome =
  { ok: true; user: UserView } | { ok: false; reason: 'duplicate_email' | 'unknown_client' };

export interface CreateUserRepository {
  insert(user: NewUser): Promise<CreateUserOutcome>;
}

export interface CreateUserRepos {
  userCreate: CreateUserRepository;
  audit: AuditWriter;
}
