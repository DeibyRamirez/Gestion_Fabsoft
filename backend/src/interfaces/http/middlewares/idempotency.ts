import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { IdempotencyService } from '../../../application/idempotency/idempotency-service.js';
import { sendProblem } from '../problem.js';
import { actorOf } from './authenticate.js';

const KEY = /^[\x21-\x7e]{8,255}$/;

/** JSON canónico (claves ordenadas) para que el orden de propiedades no cambie el hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : 1,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Middleware genérico de `Idempotency-Key` para POST de escritura (requiere `authenticate` antes).
 * Sin cabecera ⇒ pasa (opcional para humanos). Guarda respuestas < 500; ante 5xx libera la clave.
 */
export interface IdempotencyOptions {
  /** Quita secretos antes de persistir la respuesta (p. ej. contraseña temporal). */
  redact?: (body: unknown) => unknown;
}

export function idempotency(
  service: IdempotencyService,
  options: IdempotencyOptions = {},
): RequestHandler {
  return async (req, res, next) => {
    const key = req.header('idempotency-key');
    if (key === undefined) return next();
    if (!KEY.test(key))
      return sendProblem(
        res,
        'validation_error',
        'Idempotency-Key debe tener 8–255 caracteres visibles',
      );
    const actor = actorOf(res);
    const requestHash = createHash('sha256').update(canonicalJson(req.body)).digest('hex');
    const decision = await service.begin(actor, {
      key,
      method: req.method,
      path: req.baseUrl + req.path,
      requestHash,
    });

    if (decision.kind === 'in_progress')
      return sendProblem(res, 'idempotency_in_progress', 'La petición original sigue en curso');
    if (decision.kind === 'key_reused')
      return sendProblem(res, 'idempotency_key_reused', 'La clave ya se usó con otra petición');
    if (decision.kind === 'replay') {
      res.setHeader('Idempotency-Replayed', 'true');
      return res.status(decision.status).json(decision.body);
    }

    const originalJson = res.json.bind(res);
    let captured: unknown;
    res.json = (body: unknown) => {
      captured = body;
      return originalJson(body);
    };
    res.on('finish', () => {
      const done =
        res.statusCode < 500
          ? service.complete(
              actor,
              key,
              res.statusCode,
              options.redact ? options.redact(captured) : captured,
            )
          : service.release(actor, key);
      done.catch(() => undefined);
    });
    next();
  };
}
