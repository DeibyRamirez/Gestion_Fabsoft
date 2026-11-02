import type {
  IdempotencyReleaseRepository,
  IdempotencyRepository,
  IdempotencyRequest,
  StoredIdempotency,
} from '../../../../application/idempotency/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

export class PgIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly tx: Tx) {}

  async tryInsert(r: IdempotencyRequest): Promise<boolean> {
    const res = await this.tx.query(
      `insert into app.idempotency_keys (actor_type, actor_id, idem_key, request_method, request_path, request_hash)
       values ('user', $1, $2, $3, $4, $5) on conflict (actor_type, actor_id, idem_key) do nothing`,
      [r.actorId, r.key, r.method, r.path, r.requestHash],
    );
    return (res.rowCount ?? 0) === 1;
  }

  async find(actorId: string, key: string): Promise<StoredIdempotency | null> {
    const { rows } = await this.tx.query<{
      request_method: string;
      request_path: string;
      request_hash: string;
      response_status: number | null;
      response_body: unknown;
      expired: boolean;
    }>(
      `select request_method, request_path, request_hash, response_status, response_body, expires_at <= now() as expired
         from app.idempotency_keys where actor_type = 'user' and actor_id = $1 and idem_key = $2 for update`,
      [actorId, key],
    );
    const r = rows[0];
    return r
      ? {
          method: r.request_method,
          path: r.request_path,
          requestHash: r.request_hash,
          responseStatus: r.response_status,
          responseBody: r.response_body,
          expired: r.expired,
        }
      : null;
  }

  async restart(r: IdempotencyRequest): Promise<void> {
    await this.tx.query(
      `update app.idempotency_keys
          set request_method = $3, request_path = $4, request_hash = $5, response_status = null, response_body = null,
              created_at = now(), expires_at = now() + interval '24 hours'
        where actor_type = 'user' and actor_id = $1 and idem_key = $2`,
      [r.actorId, r.key, r.method, r.path, r.requestHash],
    );
  }

  async saveResponse(actorId: string, key: string, status: number, body: unknown): Promise<void> {
    await this.tx.query(
      `update app.idempotency_keys set response_status = $3, response_body = $4
        where actor_type = 'user' and actor_id = $1 and idem_key = $2`,
      [actorId, key, status, JSON.stringify(body ?? null)],
    );
  }
}

/** DELETE sólo en contexto system (0003 M2). */
export class PgIdempotencyReleaseRepository implements IdempotencyReleaseRepository {
  constructor(private readonly tx: Tx) {}
  async release(actorId: string, key: string): Promise<void> {
    await this.tx.query(
      `delete from app.idempotency_keys where actor_type = 'user' and actor_id = $1 and idem_key = $2 and response_status is null`,
      [actorId, key],
    );
  }
}
