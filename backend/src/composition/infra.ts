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
import type { MaintenanceRepos } from '../application/maintenance/cleanup/ports.js';
import type { AlertSchedulingRepos } from '../application/alerts/shared/alert-scheduling.js';
import type { ListAlertRulesRepos } from '../application/alerts/list-alert-rules/ports.js';
import type { UpdateAlertRuleRepos } from '../application/alerts/update-alert-rule/ports.js';
import type { GetDashboardSummaryRepos } from '../application/dashboard/get-dashboard-summary/ports.js';
import type {
  GetRenewalRequestQuery,
  ListRenewalRequestsRepos,
} from '../application/renewal-requests/list-renewal-requests/ports.js';
import type {
  ApiKeyAuthRepository,
  CredentialQuery,
  IntegrationClientQuery,
  IntegrationCreateRepository,
  IntegrationGetRepository,
  IntegrationListRepository,
  IntegrationManifestRepository,
  IntegrationUpdateRepository,
} from '../application/integrations/shared/ports.js';
import type { ApiKeyService } from '../application/integrations/shared/api-key.js';
import type { IntegrationRateLimiter } from '../application/integrations/shared/rate-limit.js';
import type {
  CreateIntegrationRenewalRequestRepos,
  IntegrationPeriodsRepos,
} from '../application/integrations/public-api/ports.js';
import type { ListSubscriptionsQuery } from '../application/subscriptions/list-subscriptions/ports.js';
import type { GetSubscriptionQuery } from '../application/subscriptions/get-subscription/ports.js';
import type { CreateRenewalRequestRepos } from '../application/renewal-requests/create-renewal-request/ports.js';
import type { ProcessRenewalRequestRepos } from '../application/renewal-requests/process-created/ports.js';
import type { GetPortalMeRepos } from '../application/portal/get-portal-me/ports.js';
import type { ListPortalSubscriptionsRepos } from '../application/portal/list-portal-subscriptions/ports.js';
import type { GetPortalSubscriptionRepos } from '../application/portal/get-portal-subscription/ports.js';
import type { ListPortalSubscriptionPeriodsRepos } from '../application/portal/list-portal-subscription-periods/ports.js';
import type { ListPortalRenewalRequestsRepos } from '../application/portal/list-portal-renewal-requests/ports.js';
import type { GetPortalRenewalRequestRepos } from '../application/portal/get-portal-renewal-request/ports.js';
import type { ListNotificationsRepos } from '../application/notifications/list-notifications/ports.js';
import type { MarkNotificationReadRepos } from '../application/notifications/mark-notification-read/ports.js';
import type { RetryNotificationRepos } from '../application/notifications/retry-notification/ports.js';
import type { NotificationDispatchRepos } from '../application/notifications/dispatch-notifications/ports.js';
import type { ExpireSubscriptionsRepos } from '../application/subscriptions/expire-subscriptions/ports.js';
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
import type { StartRenewalRepos } from '../application/subscriptions/start-renewal/ports.js';
import type { MarkNotRenewedRepos } from '../application/subscriptions/mark-not-renewed/ports.js';
import type { CorrectExpirationRepos } from '../application/subscriptions/correct-expiration/ports.js';
import type { UpdatePeriodPaymentRepos } from '../application/subscriptions/update-period-payment/ports.js';
import type { UpdateSubscriptionRepos } from '../application/subscriptions/update-subscription/ports.js';
import type { ListTasksRepos } from '../application/tasks/list-tasks/ports.js';
import type { GetTaskRepos } from '../application/tasks/get-task/ports.js';
import type { CreateTaskRepos } from '../application/tasks/create-task/ports.js';
import type { UpdateTaskRepos } from '../application/tasks/update-task/ports.js';
import type { CloseTaskRepos } from '../application/tasks/close-task/ports.js';
import type { TaskAutomationRepos } from '../application/tasks/shared/task-automation.js';
import type { RenewalRequestAutomationRepos } from '../application/renewal-requests/shared/renewal-request-automation.js';
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
  StartRenewalRepos &
  MarkNotRenewedRepos &
  CorrectExpirationRepos &
  UpdatePeriodPaymentRepos &
  ListSubscriptionPeriodsRepos &
  ListAuditLogsRepos &
  ListClientActivityRepos &
  ListTasksRepos &
  GetTaskRepos &
  CreateTaskRepos &
  UpdateTaskRepos &
  CloseTaskRepos &
  TaskAutomationRepos &
  RenewalRequestAutomationRepos &
  ListNotificationsRepos &
  MarkNotificationReadRepos &
  RetryNotificationRepos &
  ChangePasswordRepos &
  AlertSchedulingRepos &
  ListAlertRulesRepos &
  UpdateAlertRuleRepos &
  GetDashboardSummaryRepos &
  ListRenewalRequestsRepos &
  CreateRenewalRequestRepos &
  GetPortalMeRepos &
  ListPortalSubscriptionsRepos &
  GetPortalSubscriptionRepos &
  ListPortalSubscriptionPeriodsRepos &
  ListPortalRenewalRequestsRepos &
  GetPortalRenewalRequestRepos &
  IntegrationPeriodsRepos &
  CreateIntegrationRenewalRequestRepos & {
    integrationsList: IntegrationListRepository;
    integrationDetail: IntegrationGetRepository;
    integrationClients: IntegrationClientQuery;
    integrationCreate: IntegrationCreateRepository;
    integrationUpdate: IntegrationUpdateRepository;
    integrationManifest: IntegrationManifestRepository;
    credentials: CredentialQuery;
    integrationSubscriptions: ListSubscriptionsQuery;
    integrationSubscriptionDetail: GetSubscriptionQuery;
    renewalRequestDetail: GetRenewalRequestQuery;
  } & { idempotency: IdempotencyRepository };

/** Repos disponibles en contexto system/auth. */
export type AuthScopeRepos = LoginRepos &
  RefreshSessionRepos &
  LogoutRepos &
  AuthenticateRepos & { apiKeyAuth: ApiKeyAuthRepository } & {
    idempotencyRelease: IdempotencyReleaseRepository;
  };

/** Repos de jobs: purgas, expiración, dispatch y reconciliación. */
export type WorkerScopeRepos = { idempotency: IdempotencyPurgeRepository } & AlertSchedulingRepos &
  NotificationDispatchRepos &
  ExpireSubscriptionsRepos &
  MaintenanceRepos &
  ProcessRenewalRequestRepos;

/** Todo lo que los módulos necesitan; Pg en producción, memoria en tests (DIP). */
export interface Infra {
  userUow: UnitOfWork<UserScopeRepos>;
  authUow: AuthUnitOfWork<AuthScopeRepos>;
  workerUow: AuthUnitOfWork<WorkerScopeRepos>;
  hasher: PasswordHasher;
  apiKeys: ApiKeyService;
  integrationRateLimiter: IntegrationRateLimiter;
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
