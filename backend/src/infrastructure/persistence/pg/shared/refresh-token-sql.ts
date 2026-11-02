import type {
  NewRefreshToken,
  RevokeReason,
  StoredRefreshToken,
} from '../../../../application/auth/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';

/** Fragmentos SQL compartidos de refresh_tokens (ADR-007 §6). Requieren contexto system. */
interface Row {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}
const toStored = (r: Row): StoredRefreshToken => ({
  id: r.id,
  userId: r.user_id,
  familyId: r.family_id,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
});

export async function findRefreshByHash(
  tx: Tx,
  hash: string,
  forUpdate = false,
): Promise<StoredRefreshToken | null> {
  const { rows } = await tx.query<Row>(
    `select id, user_id, family_id, expires_at, revoked_at from app.refresh_tokens where token_hash = $1${forUpdate ? ' for update' : ''}`,
    [hash],
  );
  return rows[0] ? toStored(rows[0]) : null;
}

export async function insertRefresh(tx: Tx, t: NewRefreshToken): Promise<void> {
  await tx.query(
    `insert into app.refresh_tokens (id, user_id, family_id, token_hash, expires_at, user_agent, ip)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      t.id,
      t.userId,
      t.familyId,
      t.tokenHash,
      t.expiresAt,
      t.userAgent?.slice(0, 500) ?? null,
      t.ip,
    ],
  );
}

export async function revokeFamily(
  tx: Tx,
  familyId: string,
  reason: RevokeReason,
  at: Date,
): Promise<void> {
  await tx.query(
    `update app.refresh_tokens set revoked_at = $3, revoked_reason = $2 where family_id = $1 and revoked_at is null`,
    [familyId, reason, at],
  );
}
