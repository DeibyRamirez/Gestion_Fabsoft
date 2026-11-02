export interface IdempotencyRequest {
  actorId: string;
  key: string;
  method: string;
  path: string;
  requestHash: string;
}

export interface StoredIdempotency {
  method: string;
  path: string;
  requestHash: string;
  responseStatus: number | null;
  responseBody: unknown;
  expired: boolean;
}

/** Acceso a app.idempotency_keys con el contexto del actor (políticas 0003 M2). */
export interface IdempotencyRepository {
  /** Inserta la clave en curso; false si ya existía (on conflict do nothing). */
  tryInsert(req: IdempotencyRequest): Promise<boolean>;
  find(actorId: string, key: string): Promise<StoredIdempotency | null>;
  /** Reinicia una clave vencida como nueva petición en curso. */
  restart(req: IdempotencyRequest): Promise<void>;
  saveResponse(actorId: string, key: string, status: number, body: unknown): Promise<void>;
}

/** Libera una clave en curso tras un fallo 5xx (DELETE: sólo contexto system). */
export interface IdempotencyReleaseRepository {
  release(actorId: string, key: string): Promise<void>;
}
