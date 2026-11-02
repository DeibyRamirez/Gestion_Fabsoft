import { z } from 'zod';

/** Códigos de error `Problem.code` (docs/api/openapi.yaml). */
export const ProblemCodeSchema = z.enum([
  'validation_error',
  'ambiguous_credentials',
  'unauthenticated',
  'invalid_credentials',
  'token_expired',
  'password_change_required',
  'forbidden',
  'insufficient_scope',
  'not_found',
  'version_conflict',
  'duplicate_tax_id',
  'duplicate_email',
  'duplicate_product',
  'idempotency_in_progress',
  'idempotency_key_reused',
  'invalid_state_transition',
  'period_overlap',
  'client_archived',
  'product_inactive',
  'notification_obsolete',
  'credential_limit_reached',
  'manifest_invalid',
  'renewal_not_confirmed',
  'rate_limited',
  'maintenance',
  'dependency_unavailable',
  'internal_error',
]);
export type ProblemCode = z.infer<typeof ProblemCodeSchema>;

export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: ProblemCodeSchema,
  requestId: z.string(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type Problem = z.infer<typeof ProblemSchema>;
