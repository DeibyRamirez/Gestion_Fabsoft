import type { UserActor } from '../shared/actor.js';
import type { AuthUnitOfWork, UnitOfWork } from '../shared/ports.js';
import type {
  IdempotencyReleaseRepository,
  IdempotencyRepository,
  IdempotencyRequest,
} from './ports.js';

export type IdempotencyDecision =
  | { kind: 'proceed' }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'in_progress' }
  | { kind: 'key_reused' };

/**
 * Semántica de `Idempotency-Key` (docs/api/openapi.yaml): misma clave + mismo cuerpo en 24 h ⇒ respuesta
 * original; cuerpo/ruta distinto ⇒ key_reused (422); original en curso ⇒ in_progress (409).
 */
export class IdempotencyService {
  constructor(
    private readonly uow: UnitOfWork<{ idempotency: IdempotencyRepository }>,
    private readonly systemUow: AuthUnitOfWork<{
      idempotencyRelease: IdempotencyReleaseRepository;
    }>,
  ) {}

  begin(actor: UserActor, req: Omit<IdempotencyRequest, 'actorId'>): Promise<IdempotencyDecision> {
    const full: IdempotencyRequest = { ...req, actorId: actor.userId };
    return this.uow.run(actor, async ({ idempotency }) => {
      if (await idempotency.tryInsert(full)) return { kind: 'proceed' };
      const existing = await idempotency.find(full.actorId, full.key);
      if (!existing) return { kind: 'in_progress' };
      if (existing.expired) {
        await idempotency.restart(full);
        return { kind: 'proceed' };
      }
      if (
        existing.method !== full.method ||
        existing.path !== full.path ||
        existing.requestHash !== full.requestHash
      ) {
        return { kind: 'key_reused' };
      }
      if (existing.responseStatus === null) return { kind: 'in_progress' };
      return { kind: 'replay', status: existing.responseStatus, body: existing.responseBody };
    });
  }

  complete(actor: UserActor, key: string, status: number, body: unknown): Promise<void> {
    return this.uow.run(actor, ({ idempotency }) =>
      idempotency.saveResponse(actor.userId, key, status, body),
    );
  }

  release(actor: UserActor, key: string): Promise<void> {
    return this.systemUow.run(actor.requestId, ({ idempotencyRelease }) =>
      idempotencyRelease.release(actor.userId, key),
    );
  }
}
