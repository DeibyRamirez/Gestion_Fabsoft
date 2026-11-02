import type { Role, UserStatus } from '../../domain/users/role.js';

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export interface AccessTokenClaims {
  userId: string;
  role: Role;
  clientId: string | null;
}

export interface IssuedAccessToken {
  token: string;
  expiresIn: number;
}

/** Emisión/verificación del access token (JWT EdDSA en infraestructura, ADR-001). */
export interface AccessTokenService {
  issue(claims: AccessTokenClaims): Promise<IssuedAccessToken>;
  /** Lanza ApplicationError('token_expired' | 'unauthenticated'). */
  verify(token: string): Promise<AccessTokenClaims>;
}

/** Refresh token opaco: se entrega al cliente y se guarda sólo su hash. */
export interface RefreshTokenFactory {
  generate(): { token: string; hash: string };
  hash(token: string): string;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  clientId: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
}

export interface AuthUserWithSecret extends AuthUser {
  passwordHash: string;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface NewRefreshToken {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export type RevokeReason =
  'rotated' | 'logout' | 'reuse_detected' | 'user_disabled' | 'password_changed' | 'admin';

export interface SessionMeta {
  userAgent: string | null;
  ip: string | null;
}

export interface AuthPolicy {
  refreshTokenTtlDays: number;
}

export interface SessionResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthUser;
}
