import type { UserActor } from './actor.js';

/** Transacción + contexto RLS de un actor humano (ADR-007 §3). */
export interface UnitOfWork<R> {
  run<T>(actor: UserActor, work: (repos: R) => Promise<T>): Promise<T>;
}

/**
 * Transacción en contexto `system`/auth (búsqueda por email, refresh tokens, revocación).
 * La implementación construye el contexto en infrastructure; application nunca lo fabrica.
 */
export interface AuthUnitOfWork<R> {
  run<T>(
    requestId: string,
    work: (repos: R) => Promise<T>,
    clientRequestId?: string,
  ): Promise<T>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  uuid(): string;
}

export type AuditAction =
  | 'auth.login_failed'
  | 'auth.refresh_reuse_detected'
  | 'auth.sessions_revoked'
  | 'user.created'
  | 'user.updated'
  | 'user.role_changed'
  | 'user.disabled'
  | 'user.password_reset'
  | 'product.created'
  | 'product.updated'
  | 'product.deactivated';

export interface AuditEntry {
  /** El actor real lo fija el contexto RLS en Postgres; este campo documenta la intención en capa app. */
  actor: { type: 'user'; userId: string } | { type: 'system' };
  action: AuditAction;
  resourceType: 'user' | 'product';
  resourceId: string;
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
  requestId: string;
  ip?: string | null;
}

/** Auditoría en la misma transacción (RN-13). Debe redactar secretos. */
export interface AuditWriter {
  write(entry: AuditEntry): Promise<void>;
}
