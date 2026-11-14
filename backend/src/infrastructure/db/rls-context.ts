import type { UserActor } from '../../application/shared/actor.js';

/** Contrato ADR-004. */
export type RlsContext =
  | {
      actorType: 'user';
      userId: string;
      role: 'admin' | 'operator';
      clientId: null;
      requestId: string;
      clientRequestId?: string | undefined;
    }
  | {
      actorType: 'user';
      userId: string;
      role: 'client';
      clientId: string;
      requestId: string;
      clientRequestId?: string | undefined;
    }
  | {
      actorType: 'integration';
      integrationId: string;
      requestId: string;
      clientRequestId?: string | undefined;
    }
  | {
      actorType: 'system';
      purpose: 'auth' | 'worker' | 'maintenance';
      requestId: string;
      clientRequestId?: string | undefined;
    };

/** Única fábrica del contexto system (ADR-004 §6). Sólo infrastructure la usa. */
export const SystemContext = {
  auth: (requestId: string): RlsContext => ({ actorType: 'system', purpose: 'auth', requestId }),
  worker: (requestId: string): RlsContext => ({
    actorType: 'system',
    purpose: 'worker',
    requestId,
  }),
};

export function toRlsContext(actor: UserActor): RlsContext {
  if (actor.role === 'client') {
    if (!actor.clientId) throw new Error('Actor client sin clientId');
    return {
      actorType: 'user',
      userId: actor.userId,
      role: 'client',
      clientId: actor.clientId,
      requestId: actor.requestId,
      clientRequestId: actor.clientRequestId,
    };
  }
  return {
    actorType: 'user',
    userId: actor.userId,
    role: actor.role,
    clientId: null,
    requestId: actor.requestId,
    clientRequestId: actor.clientRequestId,
  };
}
