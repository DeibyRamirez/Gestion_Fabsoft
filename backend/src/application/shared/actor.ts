import type { Role } from '../../domain/users/role.js';

/** Actor humano autenticado. El contexto `system` sólo existe en infrastructure (ADR-004 §6). */
export type UserActor = {
  actorType: 'user';
  userId: string;
  role: Role;
  clientId: string | null;
  requestId: string;
  clientRequestId?: string | undefined;
};
