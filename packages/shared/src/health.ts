import { z } from 'zod';

/** Esquema `Health` de docs/api/openapi.yaml (GET /api/v1/health y /health/ready). */
export const HealthStatusSchema = z.enum(['ok', 'degraded', 'down']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  version: z.string().optional(),
  checks: z.record(z.enum(['ok', 'fail'])).optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
