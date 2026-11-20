import type { RequestHandler } from 'express';
import type { Clock } from '../../../application/shared/ports.js';
import type { IntegrationRateLimiter } from '../../../application/integrations/shared/rate-limit.js';
import { integrationActorOf } from './authenticate.js';
import { sendProblem } from '../problem.js';

export function integrationRateLimit(
  limiter: IntegrationRateLimiter,
  clock: Clock,
): RequestHandler {
  return (_req, res, next) => {
    const actor = integrationActorOf(res);
    const now = clock.now();
    const result = limiter.check(actor.integrationId, actor.rateLimitPerMinute, now);
    const resetSeconds = Math.max(1, Math.ceil((result.resetAt.getTime() - now.getTime()) / 1000));
    res.setHeader(
      'RateLimit',
      `limit=${result.limit}, remaining=${result.remaining}, reset=${resetSeconds}`,
    );
    res.setHeader('RateLimit-Policy', `${result.limit};w=60`);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(resetSeconds));
      return sendProblem(res, 'rate_limited', 'Límite de consumo de la integración superado');
    }
    next();
  };
}
