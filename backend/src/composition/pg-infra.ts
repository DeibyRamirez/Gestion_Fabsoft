import { PgAuditWriter } from '../infrastructure/persistence/pg/shared/pg-audit-writer.js';
import { PgAlertSchedulingRepository } from '../infrastructure/persistence/pg/alerts/pg-alert-scheduling-repository.js';
import {
  PgListAlertRulesQuery,
  PgUpdateAlertRuleRepository,
} from '../infrastructure/persistence/pg/alerts/pg-alert-rules-repositories.js';
import { PgAlertEmailTemplateRepository } from '../infrastructure/persistence/pg/alerts/pg-alert-email-template-repository.js';
import {
  PgCloseTaskRepository,
  PgCreateTaskRepository,
  PgGetTaskQuery,
  PgListTasksQuery,
  PgTaskAutomationRepository,
  PgUpdateTaskRepository,
} from '../infrastructure/persistence/pg/tasks/pg-task-repositories.js';
import { PgRenewalRequestAutomationRepository } from '../infrastructure/persistence/pg/renewal-requests/pg-renewal-request-automation-repository.js';
import { PgListRenewalRequestsQuery } from '../infrastructure/persistence/pg/renewal-requests/pg-renewal-request-list-repository.js';
import { PgRenewalRequestMutationRepository } from '../infrastructure/persistence/pg/renewal-requests/pg-renewal-request-mutation-repository.js';
import { PgRenewalRequestCreateRepository } from '../infrastructure/persistence/pg/renewal-requests/pg-renewal-request-create-repository.js';
import { PgRenewalRequestProcessRepository } from '../infrastructure/persistence/pg/renewal-requests/pg-renewal-request-process-repository.js';
import { PgIntegrationsRepository } from '../infrastructure/persistence/pg/integrations/pg-integrations-repository.js';
import { PgIntegrationSubscriptionsRepository } from '../infrastructure/persistence/pg/integrations/pg-integration-subscriptions-repository.js';
import { PgIntegrationRenewalRequestRepository } from '../infrastructure/persistence/pg/integrations/pg-integration-renewal-request-repository.js';
import {
  PgPortalMeQuery,
  PgPortalPeriodsQuery,
  PgPortalRenewalRequestsQuery,
  PgPortalSubscriptionsQuery,
} from '../infrastructure/persistence/pg/portal/pg-portal-repositories.js';
import { PgGetDashboardSummaryQuery } from '../infrastructure/persistence/pg/dashboard/pg-dashboard-repositories.js';
import { PgNotificationsRepository } from '../infrastructure/persistence/pg/notifications/pg-notifications-repositories.js';
import { PgNotificationDispatchRepository } from '../infrastructure/persistence/pg/notifications/pg-notification-dispatch-repository.js';
import { PgExpireSubscriptionsRepository } from '../infrastructure/persistence/pg/subscriptions/pg-expire-subscriptions-repository.js';
import { PgMaintenanceRepository } from '../infrastructure/persistence/pg/maintenance/pg-maintenance-repository.js';
import {
  PgAuthenticateRepository,
  PgChangePasswordRepository,
  PgGetMeQuery,
  PgLoginRepository,
  PgLogoutRepository,
  PgRefreshSessionRepository,
  PgSessionRevocationRepository,
} from '../infrastructure/persistence/pg/auth/pg-auth-repositories.js';
import {
  PgCreateUserRepository,
  PgGetUserQuery,
  PgListUsersQuery,
  PgResetUserPasswordRepository,
  PgUpdateUserRepository,
} from '../infrastructure/persistence/pg/users/pg-users-repositories.js';
import {
  PgArchiveClientRepository,
  PgCreateClientRepository,
  PgGetClientQuery,
  PgListClientsQuery,
  PgReactivateClientRepository,
  PgUpdateClientRepository,
} from '../infrastructure/persistence/pg/clients/pg-clients-repositories.js';
import {
  PgCreateClientContactRepository,
  PgListClientContactsQuery,
  PgUpdateClientContactRepository,
} from '../infrastructure/persistence/pg/clients/pg-client-contact-repositories.js';
import { PgClientOwnerCandidatesQuery } from '../infrastructure/persistence/pg/clients/pg-client-owner-candidates.js';
import {
  PgActivateSubscriptionRepository,
  PgCancelSubscriptionRepository,
  PgCorrectExpirationRepository,
  PgCreateSubscriptionRepository,
  PgGetSubscriptionQuery,
  PgListSubscriptionPeriodsQuery,
  PgListSubscriptionsQuery,
  PgMarkNotRenewedRepository,
  PgRenewSubscriptionRepository,
  PgStartRenewalRepository,
  PgUpdatePeriodPaymentRepository,
  PgUpdateSubscriptionRepository,
} from '../infrastructure/persistence/pg/subscriptions/pg-subscriptions-repositories.js';
import {
  PgCreateProductRepository,
  PgGetProductQuery,
  PgListProductsQuery,
  PgUpdateProductRepository,
} from '../infrastructure/persistence/pg/products/pg-products-repositories.js';
import {
  PgIdempotencyReleaseRepository,
  PgIdempotencyRepository,
} from '../infrastructure/persistence/pg/idempotency/pg-idempotency-repositories.js';
import { PgAuditLogRepository } from '../infrastructure/persistence/pg/audit/pg-audit-log-repositories.js';
import { PgIdempotencyPurgeRepository } from '../infrastructure/persistence/pg/maintenance/pg-idempotency-purge.js';
import { CryptoIdGenerator, SystemClock } from '../infrastructure/clock/system-clock.js';
import type { Env } from '../infrastructure/config/env.js';
import type { DbSettings } from '../infrastructure/db/connection-provider.js';
import { PgDatabaseCheck } from '../infrastructure/db/pg-health-check.js';
import { createPool } from '../infrastructure/db/pool.js';
import { PgSystemUnitOfWork, PgUnitOfWork } from '../infrastructure/db/pg-unit-of-work.js';
import { DirectPostgresProvider } from '../infrastructure/db/providers/postgres.js';
import { SupabasePoolerProvider } from '../infrastructure/db/providers/supabase.js';
import { createWithRlsContext } from '../infrastructure/db/with-rls-context.js';
import { Argon2PasswordHasher } from '../infrastructure/security/argon2-password-hasher.js';
import { JoseTokenService } from '../infrastructure/security/jose-token-service.js';
import { RandomTemporaryPasswordGenerator } from '../infrastructure/security/random-temporary-password.js';
import { Sha256RefreshTokenFactory } from '../infrastructure/security/sha256-refresh-token-factory.js';
import { HmacApiKeyService } from '../infrastructure/security/hmac-api-key-service.js';
import { InMemoryIntegrationRateLimiter } from '../infrastructure/security/in-memory-integration-rate-limiter.js';
import type { AuthScopeRepos, Infra, UserScopeRepos } from './infra.js';

export async function buildTokenService(env: Env): Promise<JoseTokenService> {
  const rest = {
    activeKid: env.JWT_ACTIVE_KID,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
  };
  if (env.JWT_PRIVATE_KEY && env.JWT_PUBLIC_KEYS)
    return JoseTokenService.fromPem(env.JWT_PRIVATE_KEY, env.JWT_PUBLIC_KEYS, rest);
  return JoseTokenService.ephemeral(rest);
}

/** Infra PostgreSQL. El proveedor (Supabase/VPS) sólo cambia la configuración del pool (ADR-008 §4). */
export async function buildPgInfra(env: Env): Promise<Infra> {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria');
  const settings: DbSettings = {
    url: env.DATABASE_URL,
    sslMode: env.DATABASE_SSL_MODE,
    sslCa: env.DATABASE_SSL_CA,
    poolMax: env.DB_POOL_MAX,
  };
  const provider =
    env.DB_PROVIDER === 'supabase'
      ? new SupabasePoolerProvider(settings)
      : new DirectPostgresProvider(settings);
  const pool = createPool(provider);
  const withRls = createWithRlsContext(pool);
  const hasher = new Argon2PasswordHasher();

  const userUow = new PgUnitOfWork<UserScopeRepos>(withRls, (tx) => ({
    me: new PgGetMeQuery(tx),
    usersList: new PgListUsersQuery(tx),
    userDetail: new PgGetUserQuery(tx),
    userCreate: new PgCreateUserRepository(tx),
    userUpdate: new PgUpdateUserRepository(tx),
    userPasswordReset: new PgResetUserPasswordRepository(tx),
    productsList: new PgListProductsQuery(tx),
    productDetail: new PgGetProductQuery(tx),
    productCreate: new PgCreateProductRepository(tx),
    productUpdate: new PgUpdateProductRepository(tx),
    clientsList: new PgListClientsQuery(tx),
    clientDetail: new PgGetClientQuery(tx),
    clientCreate: new PgCreateClientRepository(tx),
    clientUpdate: new PgUpdateClientRepository(tx),
    clientArchive: new PgArchiveClientRepository(tx),
    clientReactivate: new PgReactivateClientRepository(tx),
    clientContactsList: new PgListClientContactsQuery(tx),
    clientOwnerCandidates: new PgClientOwnerCandidatesQuery(tx),
    clientContactCreate: new PgCreateClientContactRepository(tx),
    clientContactUpdate: new PgUpdateClientContactRepository(tx),
    subscriptionCreate: new PgCreateSubscriptionRepository(tx),
    subscriptionsList: new PgListSubscriptionsQuery(tx),
    subscriptionDetail: new PgGetSubscriptionQuery(tx),
    subscriptionActivate: new PgActivateSubscriptionRepository(tx),
    subscriptionUpdate: new PgUpdateSubscriptionRepository(tx),
    subscriptionCancel: new PgCancelSubscriptionRepository(tx),
    subscriptionRenew: new PgRenewSubscriptionRepository(tx),
    subscriptionStartRenewal: new PgStartRenewalRepository(tx),
    subscriptionMarkNotRenewed: new PgMarkNotRenewedRepository(tx),
    subscriptionCorrectExpiration: new PgCorrectExpirationRepository(tx),
    subscriptionPeriodPayment: new PgUpdatePeriodPaymentRepository(tx),
    subscriptionPeriods: new PgListSubscriptionPeriodsQuery(tx),
    auditLogs: new PgAuditLogRepository(tx),
    clientActivity: new PgAuditLogRepository(tx),
    tasksList: new PgListTasksQuery(tx),
    taskDetail: new PgGetTaskQuery(tx),
    taskCreate: new PgCreateTaskRepository(tx),
    taskUpdate: new PgUpdateTaskRepository(tx),
    taskClose: new PgCloseTaskRepository(tx),
    tasksAutomation: new PgTaskAutomationRepository(tx),
    renewalRequests: new PgRenewalRequestAutomationRepository(tx),
    renewalRequestsList: new PgListRenewalRequestsQuery(tx),
    renewalRequestDetail: new PgListRenewalRequestsQuery(tx),
    renewalRequestUpdate: new PgRenewalRequestMutationRepository(tx),
    renewalRequestResolve: new PgRenewalRequestMutationRepository(tx),
    renewalRequestCreate: new PgRenewalRequestCreateRepository(tx),
    portalMe: new PgPortalMeQuery(tx),
    portalSubscriptions: new PgPortalSubscriptionsQuery(tx),
    portalSubscription: new PgPortalSubscriptionsQuery(tx),
    portalPeriods: new PgPortalPeriodsQuery(tx),
    portalRenewalRequests: new PgPortalRenewalRequestsQuery(tx),
    portalRenewalRequest: new PgPortalRenewalRequestsQuery(tx),
    integrationsList: new PgIntegrationsRepository(tx),
    integrationDetail: new PgIntegrationsRepository(tx),
    integrationClients: new PgIntegrationsRepository(tx),
    integrationCreate: new PgIntegrationsRepository(tx),
    integrationUpdate: new PgIntegrationsRepository(tx),
    integrationManifest: new PgIntegrationsRepository(tx),
    credentials: new PgIntegrationsRepository(tx),
    integrationSubscriptions: new PgIntegrationSubscriptionsRepository(tx),
    integrationSubscriptionDetail: new PgIntegrationSubscriptionsRepository(tx),
    integrationPeriods: new PgIntegrationSubscriptionsRepository(tx),
    integrationRequestCreate: new PgIntegrationRenewalRequestRepository(tx),
    dashboardSummary: new PgGetDashboardSummaryQuery(tx),
    notificationsList: new PgNotificationsRepository(tx),
    notificationsRead: new PgNotificationsRepository(tx),
    notificationsRetry: new PgNotificationsRepository(tx),
    password: new PgChangePasswordRepository(tx),
    sessions: new PgSessionRevocationRepository(tx),
    idempotency: new PgIdempotencyRepository(tx),
    alerts: new PgAlertSchedulingRepository(tx),
    alertRulesList: new PgListAlertRulesQuery(tx),
    alertRuleUpdate: new PgUpdateAlertRuleRepository(tx),
    alertEmailTemplate: new PgAlertEmailTemplateRepository(tx),
    audit: new PgAuditWriter(tx),
  }));
  const authUow = new PgSystemUnitOfWork<AuthScopeRepos>(withRls, (tx) => ({
    login: new PgLoginRepository(tx),
    refresh: new PgRefreshSessionRepository(tx),
    logout: new PgLogoutRepository(tx),
    authenticate: new PgAuthenticateRepository(tx),
    apiKeyAuth: new PgIntegrationsRepository(tx),
    idempotencyRelease: new PgIdempotencyReleaseRepository(tx),
    audit: new PgAuditWriter(tx),
  }));
  const apiKeyPepper =
    env.API_KEY_PEPPER ??
    (env.APP_ENV === 'prod' ? '' : 'dev-api-key-pepper-32-characters-minimum');
  const apiKeys = new HmacApiKeyService({
    pepper: apiKeyPepper,
    previousPepper: env.API_KEY_PEPPER_PREVIOUS,
    keyEnv: env.API_KEY_ENV,
  });
  const workerUow = new PgSystemUnitOfWork(
    withRls,
    (tx) => ({
      idempotency: new PgIdempotencyPurgeRepository(tx),
      alerts: new PgAlertSchedulingRepository(tx),
      notificationsDispatch: new PgNotificationDispatchRepository(tx),
      alertEmailTemplate: new PgAlertEmailTemplateRepository(tx),
      subscriptionsExpire: new PgExpireSubscriptionsRepository(tx),
      maintenance: new PgMaintenanceRepository(tx),
      renewalRequestProcess: new PgRenewalRequestProcessRepository(tx),
    }),
    'worker',
  );

  return {
    userUow,
    authUow,
    workerUow,
    hasher,
    apiKeys,
    integrationRateLimiter: new InMemoryIntegrationRateLimiter(),
    tokens: await buildTokenService(env),
    refreshTokens: new Sha256RefreshTokenFactory(),
    passwords: new RandomTemporaryPasswordGenerator(),
    clock: new SystemClock(),
    ids: new CryptoIdGenerator(),
    dummyHash: await hasher.hash('fabsoft-dummy-password-for-timing'),
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    readinessChecks: [new PgDatabaseCheck(pool)],
    close: () => pool.end(),
  };
}
