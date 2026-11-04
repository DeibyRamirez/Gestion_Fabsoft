import type { ProblemCode } from '@fabsoft/shared';
import type { Response } from 'express';

export const STATUS_BY_CODE: Partial<Record<ProblemCode, number>> = {
  validation_error: 400,
  ambiguous_credentials: 400,
  unauthenticated: 401,
  invalid_credentials: 401,
  token_expired: 401,
  password_change_required: 403,
  forbidden: 403,
  insufficient_scope: 403,
  not_found: 404,
  version_conflict: 409,
  client_tax_id_taken: 409,
  primary_contact_conflict: 409,
  duplicate_email: 409,
  duplicate_product: 409,
  idempotency_in_progress: 409,
  invalid_state_transition: 422,
  idempotency_key_reused: 422,
  period_overlap: 422,
  client_archived: 422,
  client_inactive: 422,
  product_inactive: 422,
  notification_obsolete: 422,
  credential_limit_reached: 422,
  manifest_invalid: 422,
  renewal_not_confirmed: 422,
  rate_limited: 429,
  maintenance: 503,
  dependency_unavailable: 503,
  internal_error: 500,
};

const TITLES: Partial<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export function sendProblem(
  res: Response,
  code: ProblemCode,
  detail?: string,
  errors?: ReadonlyArray<{ path: string; message: string }>,
): void {
  const status = STATUS_BY_CODE[code] ?? 500;
  res
    .status(status)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title: TITLES[status] ?? 'Error',
      status,
      code,
      requestId: String(res.locals['requestId'] ?? ''),
      ...(detail ? { detail } : {}),
      ...(errors?.length ? { errors } : {}),
    });
}
