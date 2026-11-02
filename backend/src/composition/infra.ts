import type {
  IdempotencyReleaseRepository,
  IdempotencyRepository,
} from '../application/idempotency/ports.js';
import type { DependencyCheck } from '../application/health/get-readiness/ports.js';
import type { AuthenticateRepos } from '../application/auth/authenticate/ports.js';
import type { ChangePasswordRepos } from '../application/auth/change-password/ports.js';
import type { GetMeRepos } from '../application/auth/get-me/ports.js';
import type { LoginRepos } from '../application/auth/login/ports.js';
import type { LogoutRepos } from '../application/auth/logout/ports.js';
import type {
  AccessTokenService,
  PasswordHasher,
  RefreshTokenFactory,
} from '../application/auth/ports.js';
import type { RefreshSessionRepos } from '../application/auth/refresh-session/ports.js';
import type { IdempotencyPurgeRepository } from '../application/maintenance/purge-idempotency-keys/ports.js';
import type {
  AuthUnitOfWork,
  Clock,
  IdGenerator,
  UnitOfWork,
} from '../application/shared/ports.js';
import type { CreateUserRepos } from '../application/users/create-user/ports.js';
import type { GetUserRepos } from '../application/users/get-user/ports.js';
import type { ListUsersRepos } from '../application/users/list-users/ports.js';
import type { ResetUserPasswordRepos } from '../application/users/reset-user-password/ports.js';
import type { TemporaryPasswordGenerator } from '../application/users/shared/ports.js';
import type { UpdateUserRepos } from '../application/users/update-user/ports.js';

/** Repos disponibles en una transacción de actor humano. */
export type UserScopeRepos = GetMeRepos &
  ListUsersRepos &
  GetUserRepos &
  CreateUserRepos &
  UpdateUserRepos &
  ResetUserPasswordRepos &
  ChangePasswordRepos & { idempotency: IdempotencyRepository };

/** Repos disponibles en contexto system/auth. */
export type AuthScopeRepos = LoginRepos &
  RefreshSessionRepos &
  LogoutRepos &
  AuthenticateRepos & { idempotencyRelease: IdempotencyReleaseRepository };

/** Todo lo que los módulos necesitan; Pg en producción, memoria en tests (DIP). */
export interface Infra {
  userUow: UnitOfWork<UserScopeRepos>;
  authUow: AuthUnitOfWork<AuthScopeRepos>;
  workerUow: AuthUnitOfWork<{ idempotency: IdempotencyPurgeRepository }>;
  hasher: PasswordHasher;
  tokens: AccessTokenService;
  refreshTokens: RefreshTokenFactory;
  passwords: TemporaryPasswordGenerator;
  clock: Clock;
  ids: IdGenerator;
  dummyHash: string;
  refreshTokenTtlDays: number;
  readinessChecks: DependencyCheck[];
  close(): Promise<void>;
}
