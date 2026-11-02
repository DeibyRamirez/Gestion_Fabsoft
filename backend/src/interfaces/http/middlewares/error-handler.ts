import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApplicationError } from '../../../application/shared/application-error.js';
import { DomainError } from '../../../domain/shared/domain-error.js';
import { sendProblem } from '../problem.js';

/** Traduce errores a problem+json. SQLSTATE 42501 (RLS/privilegios) ⇒ 403 (contrato 0003). */
export function errorHandler(log: (entry: Record<string, unknown>) => void): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      return sendProblem(
        res,
        'validation_error',
        'Entrada inválida',
        err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    if (err instanceof ApplicationError) return sendProblem(res, err.code, err.message);
    if (err instanceof DomainError) return sendProblem(res, err.code, err.message, err.details);
    if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '42501') {
      return sendProblem(res, 'forbidden', 'Operación no permitida');
    }
    if (
      typeof err === 'object' &&
      err !== null &&
      (err as { type?: unknown }).type === 'entity.parse.failed'
    ) {
      return sendProblem(res, 'validation_error', 'JSON inválido');
    }
    log({
      level: 'error',
      msg: 'http.unhandled_error',
      requestId: res.locals['requestId'],
      err: String(err),
    });
    return sendProblem(res, 'internal_error');
  };
}
