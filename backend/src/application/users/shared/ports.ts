/** Genera contraseñas temporales (≥16 caracteres, se muestran una sola vez). */
export interface TemporaryPasswordGenerator {
  generate(): string;
}

export type SessionRevocationReason = 'user_disabled' | 'password_changed' | 'admin';

/**
 * Revoca sesiones en la MISMA transacción del cambio (0005: app.revoke_user_sessions,
 * autorizado para admin, system o el propio usuario).
 */
export interface SessionRevocationRepository {
  /** `exceptTokenHash`: conserva la familia de esa sesión (cambio de contraseña propio). */
  revokeAllForUser(
    userId: string,
    reason: SessionRevocationReason,
    exceptTokenHash?: string,
  ): Promise<void>;
}
