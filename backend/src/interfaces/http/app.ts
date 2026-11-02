import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { API_VERSION_PREFIX, CSRF_HEADER } from '@fabsoft/shared';
import { authenticate, requirePasswordChanged } from './middlewares/authenticate.js';
import type { IdempotencyService } from '../../application/idempotency/idempotency-service.js';
import { idempotency } from './middlewares/idempotency.js';
import { errorHandler } from './middlewares/error-handler.js';
import { requestId } from './middlewares/request-id.js';
import { sendProblem } from './problem.js';
import { authRouter, type AuthRouteDeps } from './routes/v1/auth.js';
import { healthRouter, type HealthRouteDeps } from './routes/v1/health.js';
import { usersRouter, type UsersRouteDeps } from './routes/v1/users.js';

export type AppDeps = HealthRouteDeps &
  AuthRouteDeps &
  UsersRouteDeps & {
    corsOrigins: string[];
    idempotencyService: IdempotencyService;
    log: (entry: Record<string, unknown>) => void;
  };

/** createApp(deps): sólo HTTP; las dependencias llegan desde composition (DIP). */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(helmet());
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
  app.use(`${API_VERSION_PREFIX}/auth`, authRouter(deps));
  // La contraseña temporal nunca se persiste en idempotency_keys: un replay no la vuelve a mostrar.
  const createUserIdempotency = idempotency(deps.idempotencyService, {
    redact: (body) =>
      body && typeof body === 'object' ? { ...body, temporaryPassword: undefined } : body,
  });
  app.use(API_VERSION_PREFIX, usersRouter(deps, guards, createUserIdempotency));

  app.use((_req, res) => sendProblem(res, 'not_found', 'Recurso no encontrado'));
  app.use(errorHandler(deps.log));
  return app;
}
