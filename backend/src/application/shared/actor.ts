import type { ClientScope, Scope } from '@fabsoft/shared';
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

/** Actor de integración autenticado por API key (RN-12). */
export type IntegrationActor = {
  actorType: 'integration';
  integrationId: string;
  scopes: Scope[];
  clientScope: ClientScope;
  rateLimitPerMinute: number;
  requestId: string;
  clientRequestId?: string | undefined;
};

export type Actor = UserActor | IntegrationActor;
