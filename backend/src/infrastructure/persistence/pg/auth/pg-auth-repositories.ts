import type { AuthenticateRepository } from '../../../../application/auth/authenticate/ports.js';
import type { ChangePasswordRepository } from '../../../../application/auth/change-password/ports.js';
import type { GetMeQuery } from '../../../../application/auth/get-me/ports.js';
import type { LoginRepository } from '../../../../application/auth/login/ports.js';
import type { LogoutRepository } from '../../../../application/auth/logout/ports.js';
import type {
  AuthUser,
  AuthUserWithSecret,
  NewRefreshToken,
  RevokeReason,
  StoredRefreshToken,
} from '../../../../application/auth/ports.js';
import type { RefreshSessionRepository } from '../../../../application/auth/refresh-session/ports.js';
import type {
  SessionRevocationReason,
  SessionRevocationRepository,
} from '../../../../application/users/shared/ports.js';
import type { Tx } from '../../../db/with-rls-context.js';
import { findRefreshByHash, insertRefresh, revokeFamily } from '../shared/refresh-token-sql.js';
import { toAuthUser, USER_COLUMNS, type UserRow } from '../shared/user-columns.js';

/** Repositorios por caso de uso del módulo auth (ADR-007). SQL explícito; sin `select *`. */

async function loadAuthUser(tx: Tx, id: string): Promise<AuthUser | null> {
  const { rows } = await tx.query<UserRow>(`select ${USER_COLUMNS} from app.users where id = $1`, [
    id,
  ]);
  return rows[0] ? toAuthUser(rows[0]) : null;
}

/** El hash sólo se obtiene con app.auth_password_hash() (contrato 0003). */
async function withSecret(tx: Tx, row: UserRow | undefined): Promise<AuthUserWithSecret | null> {
  if (!row) return null;
  const { rows } = await tx.query<{ hash: string | null }>(
    `select app.auth_password_hash($1) as hash`,
    [row.id],
  );
  const hash = rows[0]?.hash;
  return hash ? { ...toAuthUser(row), passwordHash: hash } : null;
}

export class PgLoginRepository implements LoginRepository {
  constructor(private readonly tx: Tx) {}
  async findByEmail(email: string): Promise<AuthUserWithSecret | null> {
    const { rows } = await this.tx.query<UserRow>(
      `select ${USER_COLUMNS} from app.users where lower(email) = lower($1)`,
      [email],
    );
    return withSecret(this.tx, rows[0]);
  }
  async recordSuccessfulLogin(userId: string, at: Date): Promise<void> {
    await this.tx.query(`update app.users set last_login_at = $2 where id = $1`, [userId, at]);
  }
  createRefreshToken(token: NewRefreshToken): Promise<void> {
    return insertRefresh(this.tx, token);
  }
}

export class PgRefreshSessionRepository implements RefreshSessionRepository {
  constructor(private readonly tx: Tx) {}
  findByHashForUpdate(hash: string): Promise<StoredRefreshToken | null> {
    return findRefreshByHash(this.tx, hash, true);
  }
  loadUser(userId: string): Promise<AuthUser | null> {
    return loadAuthUser(this.tx, userId);
  }
  async rotate(oldTokenId: string, replacement: NewRefreshToken, at: Date): Promise<void> {
    await insertRefresh(this.tx, replacement);
    await this.tx.query(
      `update app.refresh_tokens set revoked_at = $2, revoked_reason = 'rotated', replaced_by = $3 where id = $1`,
      [oldTokenId, at, replacement.id],
    );
  }
  revokeFamily(familyId: string, reason: RevokeReason, at: Date): Promise<void> {
    return revokeFamily(this.tx, familyId, reason, at);
  }
}

export class PgLogoutRepository implements LogoutRepository {
  constructor(private readonly tx: Tx) {}
  findByHash(hash: string): Promise<StoredRefreshToken | null> {
    return findRefreshByHash(this.tx, hash);
  }
  revokeFamily(familyId: string, reason: RevokeReason, at: Date): Promise<void> {
    return revokeFamily(this.tx, familyId, reason, at);
  }
}

export class PgAuthenticateRepository implements AuthenticateRepository {
  constructor(private readonly tx: Tx) {}
  loadUser(userId: string): Promise<AuthUser | null> {
    return loadAuthUser(this.tx, userId);
  }
}

export class PgGetMeQuery implements GetMeQuery {
  constructor(private readonly tx: Tx) {}
  findProfile(userId: string): Promise<AuthUser | null> {
    return loadAuthUser(this.tx, userId);
  }
}

export class PgChangePasswordRepository implements ChangePasswordRepository {
  constructor(private readonly tx: Tx) {}
  async loadWithSecret(userId: string): Promise<AuthUserWithSecret | null> {
    const { rows } = await this.tx.query<UserRow>(
      `select ${USER_COLUMNS} from app.users where id = $1`,
      [userId],
    );
    return withSecret(this.tx, rows[0]);
  }
  async updatePassword(userId: string, passwordHash: string, at: Date): Promise<void> {
    await this.tx.query(
      `update app.users set password_hash = $2, must_change_password = false, password_changed_at = $3 where id = $1`,
      [userId, passwordHash, at],
    );
  }
}

export class PgSessionRevocationRepository implements SessionRevocationRepository {
  constructor(private readonly tx: Tx) {}
  /** 0005: app.revoke_user_sessions (SECURITY DEFINER) en la misma transacción del cambio. */
  async revokeAllForUser(
    userId: string,
    reason: SessionRevocationReason,
    exceptTokenHash?: string,
  ): Promise<void> {
    await this.tx.query('select app.revoke_user_sessions($1, $2, $3)', [
      userId,
      reason,
      exceptTokenHash ?? null,
    ]);
  }
}
