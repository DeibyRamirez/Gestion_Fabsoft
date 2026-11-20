import rateLimit from 'express-rate-limit';
import { IdempotencyService } from '../application/idempotency/idempotency-service.js';
import { GetReadiness } from '../application/health/get-readiness/use-case.js';
import { GetLiveness } from '../application/health/get-liveness/use-case.js';
import type { Env } from '../infrastructure/config/env.js';
import { StaticAppInfo } from '../infrastructure/config/static-app-info.js';
import type { AppDeps } from '../interfaces/http/app.js';
import { ipBlocklist } from '../interfaces/http/middlewares/ip-blocklist.js';
import { sendProblem } from '../interfaces/http/problem.js';
import type { Infra } from './infra.js';
import { alertsModule } from './modules/alerts.js';
import { auditModule } from './modules/audit.js';
import { authModule } from './modules/auth.js';
import { clientContactsModule } from './modules/client-contacts.js';
import { clientsModule } from './modules/clients.js';
import { dashboardModule } from './modules/dashboard.js';
import { integrationsModule } from './modules/integrations.js';
import { renewalRequestsModule } from './modules/renewal-requests.js';
import { notificationsModule } from './modules/notifications.js';
import { portalModule } from './modules/portal.js';
import { productsModule } from './modules/products.js';
import { subscriptionsModule } from './modules/subscriptions.js';
import { tasksModule } from './modules/tasks.js';
import { usersModule } from './modules/users.js';

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));

/** Composition root manual (ADR-006): sin contenedor DI con decoradores. */
export function buildContainer(env: Env, infra: Infra): AppDeps {
  const limited = (
    limit: number,
    key: (req: { ip?: string | undefined; body?: unknown }) => string,
  ) =>
    rateLimit({
      windowMs: 60_000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (req) => key(req),
      handler: (_req, res) => sendProblem(res, 'rate_limited', 'Demasiados intentos'),
    });
  const ip = (req: { ip?: string | undefined }) => req.ip ?? 'unknown';
  const email = (req: { body?: unknown }) => {
    const e = (req.body as { email?: unknown } | undefined)?.email;
    return typeof e === 'string' ? e.trim().toLowerCase() : '';
  };
  const loginIpBlocklist = ipBlocklist({
    threshold: env.LOGIN_IP_FAILURE_THRESHOLD,
    windowMs: env.LOGIN_IP_FAILURE_WINDOW_MINUTES * 60_000,
    blockMs: env.LOGIN_IP_BLOCK_MINUTES * 60_000,
    log,
  });

  return {
    getLiveness: new GetLiveness(new StaticAppInfo(env.APP_VERSION)),
    getReadiness: new GetReadiness(infra.readinessChecks, new StaticAppInfo(env.APP_VERSION)),
    ...authModule(infra),
    ...usersModule(infra),
    ...productsModule(infra),
    ...clientsModule(infra),
    ...clientContactsModule(infra),
    ...subscriptionsModule(infra),
    ...tasksModule(infra),
    ...notificationsModule(infra),
    ...alertsModule(infra),
    ...dashboardModule(infra),
    ...renewalRequestsModule(infra),
    ...portalModule(infra),
    ...integrationsModule(infra),
    ...auditModule(infra),
    cookie: { secure: env.APP_ENV !== 'test', domain: env.COOKIE_DOMAIN || undefined },
    loginIpBlocklist,
    loginRateLimit: [
      limited(env.LOGIN_RATE_LIMIT_PER_MINUTE, ip),
      limited(env.LOGIN_RATE_LIMIT_PER_EMAIL, (req) => `${ip(req)}|${email(req)}`),
    ],
    corsOrigins: env.CORS_ALLOWED_ORIGINS,
    idempotencyService: new IdempotencyService(infra.userUow, infra.authUow),
    log,
  };
}
