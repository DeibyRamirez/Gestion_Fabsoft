import { Router } from 'express';
import type { GetLiveness } from '../../../../application/health/get-liveness/use-case.js';
import type { GetReadiness } from '../../../../application/health/get-readiness/use-case.js';

export interface HealthRouteDeps {
  getLiveness: GetLiveness;
  getReadiness: GetReadiness;
}

export function healthRouter({ getLiveness, getReadiness }: HealthRouteDeps): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.status(200).json(getLiveness.execute());
  });
  /** 503 si alguna dependencia falla, para que el proxy/monitor saque la instancia. */
  router.get('/health/ready', async (_req, res) => {
    const result = await getReadiness.execute();
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.status === 'ok' ? 200 : 503).json(result);
  });
  return router;
}
