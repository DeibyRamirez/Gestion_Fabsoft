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
  duplicate_email: 409,
  duplicate_product: 409,
  invalid_state_transition: 422,
  idempotency_in_progress: 409,
  idempotency_key_reused: 422,
  rate_limited: 429,
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
