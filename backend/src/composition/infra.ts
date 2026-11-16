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
import type { ListAuditLogsRepos } from '../application/audit/list-audit-logs/ports.js';
import type { ArchiveClientRepos } from '../application/clients/archive-client/ports.js';
import type { CreateClientRepos } from '../application/clients/create-client/ports.js';
import type { CreateClientContactRepos } from '../application/clients/create-client-contact/ports.js';
import type { GetClientRepos } from '../application/clients/get-client/ports.js';
import type { ListClientActivityRepos } from '../application/clients/list-client-activity/ports.js';
import type { ListClientContactsRepos } from '../application/clients/list-client-contacts/ports.js';
import type { ListClientsRepos } from '../application/clients/list-clients/ports.js';
import type { ReactivateClientRepos } from '../application/clients/reactivate-client/ports.js';
import type { UpdateClientContactRepos } from '../application/clients/update-client-contact/ports.js';
import type { UpdateClientRepos } from '../application/clients/update-client/ports.js';
import type { ActivateSubscriptionRepos } from '../application/subscriptions/activate-subscription/ports.js';
import type { CancelSubscriptionRepos } from '../application/subscriptions/cancel-subscription/ports.js';
import type { CreateSubscriptionRepos } from '../application/subscriptions/create-subscription/ports.js';
import type { GetSubscriptionRepos } from '../application/subscriptions/get-subscription/ports.js';
import type { ListSubscriptionPeriodsRepos } from '../application/subscriptions/list-subscription-periods/ports.js';
import type { ListSubscriptionsRepos } from '../application/subscriptions/list-subscriptions/ports.js';
import type { RenewSubscriptionRepos } from '../application/subscriptions/renew-subscription/ports.js';
import type { UpdateSubscriptionRepos } from '../application/subscriptions/update-subscription/ports.js';
import type { CreateProductRepos } from '../application/products/create-product/ports.js';
import type { GetProductRepos } from '../application/products/get-product/ports.js';
import type { ListProductsRepos } from '../application/products/list-products/ports.js';
import type { UpdateProductRepos } from '../application/products/update-product/ports.js';
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
  ListProductsRepos &
  GetProductRepos &
  CreateProductRepos &
  UpdateProductRepos &
  ListClientsRepos &
  GetClientRepos &
  CreateClientRepos &
  UpdateClientRepos &
  ArchiveClientRepos &
  ReactivateClientRepos &
  ListClientContactsRepos &
  CreateClientContactRepos &
  UpdateClientContactRepos &
  CreateSubscriptionRepos &
  ListSubscriptionsRepos &
  GetSubscriptionRepos &
  ActivateSubscriptionRepos &
  UpdateSubscriptionRepos &
  CancelSubscriptionRepos &
  RenewSubscriptionRepos &
  ListSubscriptionPeriodsRepos &
  ListAuditLogsRepos &
  ListClientActivityRepos &
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
