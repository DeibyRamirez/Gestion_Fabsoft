import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { API_VERSION_PREFIX, CSRF_HEADER } from '@fabsoft/shared';
import { authenticate, requirePasswordChanged } from './middlewares/authenticate.js';
import type { IdempotencyService } from '../../application/idempotency/idempotency-service.js';
import type { AuthenticateApiKey } from '../../application/integrations/authenticate-api-key/use-case.js';
import { idempotency } from './middlewares/idempotency.js';
import { errorHandler } from './middlewares/error-handler.js';
import { requestId } from './middlewares/request-id.js';
import { sendProblem } from './problem.js';
import { alertRulesRouter, type AlertRulesRouteDeps } from './routes/v1/alert-rules.js';
import { auditLogsRouter, type AuditLogsRouteDeps } from './routes/v1/audit-logs.js';
import { authRouter, type AuthRouteDeps } from './routes/v1/auth.js';
import { clientActivityRouter, type ClientActivityRouteDeps } from './routes/v1/client-activity.js';
import { dashboardRouter, type DashboardRouteDeps } from './routes/v1/dashboard.js';
import {
  renewalRequestsRouter,
  type RenewalRequestsRouteDeps,
} from './routes/v1/renewal-requests.js';
import { healthRouter, type HealthRouteDeps } from './routes/v1/health.js';
import { openapiDocsRouter } from './routes/v1/openapi-docs.js';
import { integrationApiRouter, type IntegrationApiRouteDeps } from './routes/v1/integration-api.js';
import { integrationsRouter, type IntegrationsRouteDeps } from './routes/v1/integrations.js';
import { clientsRouter, type ClientsRouteDeps } from './routes/v1/clients.js';
import { clientContactsRouter, type ClientContactsRouteDeps } from './routes/v1/client-contacts.js';
import { notificationsRouter, type NotificationsRouteDeps } from './routes/v1/notifications.js';
import { portalRouter, type PortalRouteDeps } from './routes/v1/portal.js';
import { productsRouter, type ProductsRouteDeps } from './routes/v1/products.js';
import { subscriptionsRouter, type SubscriptionsRouteDeps } from './routes/v1/subscriptions.js';
import { tasksRouter, type TasksRouteDeps } from './routes/v1/tasks.js';
import { usersRouter, type UsersRouteDeps } from './routes/v1/users.js';

export type AppDeps = HealthRouteDeps &
  AuthRouteDeps &
  UsersRouteDeps &
  ProductsRouteDeps &
  ClientsRouteDeps &
  ClientContactsRouteDeps &
  SubscriptionsRouteDeps &
  TasksRouteDeps &
  NotificationsRouteDeps &
  AlertRulesRouteDeps &
  DashboardRouteDeps &
  RenewalRequestsRouteDeps &
  PortalRouteDeps &
  IntegrationsRouteDeps &
  IntegrationApiRouteDeps &
  AuditLogsRouteDeps &
  ClientActivityRouteDeps & {
    corsOrigins: string[];
    idempotencyService: IdempotencyService;
    authenticateApiKey: AuthenticateApiKey;
    log: (entry: Record<string, unknown>) => void;
  };

/** createApp(deps): sólo HTTP; las dependencias llegan desde composition (DIP). */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(
    helmet({
      // API JSON: no necesita scripts, estilos ni recursos externos.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
          'frame-ancestors': ["'none'"],
          'object-src': ["'none'"],
          'script-src': ["'none'"],
          'style-src': ["'none'"],
          'img-src': ["'none'"],
          'connect-src': ["'self'"],
        },
      },
      strictTransportSecurity: {
        maxAge: 31_536_000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      originAgentCluster: true,
      xFrameOptions: { action: 'deny' },
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    next();
  });
  app.use(
    cors({
      origin: deps.corsOrigins,
      credentials: true,
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        CSRF_HEADER,
        'Idempotency-Key',
        'X-Request-Id',
      ],
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const guards = [authenticate(deps.authenticateAccessToken), requirePasswordChanged];
  app.use(API_VERSION_PREFIX, healthRouter(deps));
  app.use(`${API_VERSION_PREFIX}/docs`, openapiDocsRouter());
  app.use(`${API_VERSION_PREFIX}/auth`, authRouter(deps));
  const integrationApiIdempotency = idempotency(deps.idempotencyService);
  app.use(API_VERSION_PREFIX, integrationApiRouter(deps, integrationApiIdempotency));
  app.use(API_VERSION_PREFIX, alertRulesRouter(deps, guards));
  app.use(API_VERSION_PREFIX, dashboardRouter(deps, guards));
  const createRenewalRequestIdempotency = idempotency(deps.idempotencyService);
  app.use(API_VERSION_PREFIX, renewalRequestsRouter(deps, guards, createRenewalRequestIdempotency));
  app.use(API_VERSION_PREFIX, portalRouter(deps, guards, createRenewalRequestIdempotency));
  const createIntegrationIdempotency = idempotency(deps.idempotencyService);
  app.use(API_VERSION_PREFIX, integrationsRouter(deps, guards, createIntegrationIdempotency));
  // La contraseña temporal nunca se persiste en idempotency_keys: un replay no la vuelve a mostrar.
  const createUserIdempotency = idempotency(deps.idempotencyService, {
    redact: (body) =>
      body && typeof body === 'object' ? { ...body, temporaryPassword: undefined } : body,
  });
  app.use(API_VERSION_PREFIX, usersRouter(deps, guards, createUserIdempotency));
  const createProductIdempotency = idempotency(deps.idempotencyService);
  app.use(API_VERSION_PREFIX, productsRouter(deps, guards, createProductIdempotency));
  const createClientIdempotency = idempotency(deps.idempotencyService);
  app.use(API_VERSION_PREFIX, clientsRouter(deps, guards, createClientIdempotency));
  app.use(API_VERSION_PREFIX, clientContactsRouter(deps, guards));
  app.use(API_VERSION_PREFIX, clientActivityRouter(deps, guards));
  const createSubscriptionIdempotency = idempotency(deps.idempotencyService);
  app.use(API_VERSION_PREFIX, subscriptionsRouter(deps, guards, createSubscriptionIdempotency));
  const createTaskIdempotency = idempotency(deps.idempotencyService);
  app.use(API_VERSION_PREFIX, tasksRouter(deps, guards, createTaskIdempotency));
  app.use(API_VERSION_PREFIX, notificationsRouter(deps, guards));
  app.use(API_VERSION_PREFIX, auditLogsRouter(deps, guards));

  app.use((_req, res) => sendProblem(res, 'not_found', 'Recurso no encontrado'));
  app.use(errorHandler(deps.log));
  return app;
}
