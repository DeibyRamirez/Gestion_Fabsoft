import type { RequestHandler } from 'express';
import { sendProblem } from '../problem.js';

export interface IpBlocklistOptions {
  /** Intentos fallidos (401) por IP dentro de la ventana antes de bloquear. */
  threshold: number;
  /** Ventana móvil de conteo, en milisegundos. */
  windowMs: number;
  /** Duración del bloqueo, en milisegundos. */
  blockMs: number;
  /** Reloj inyectable para pruebas. */
  now?: () => number;
  log?: (entry: Record<string, unknown>) => void;
}

interface IpState {
  failures: number[];
  blockedUntil: number;
}

const SWEEP_INTERVAL_MS = 60_000;
const MAX_TRACKED_IPS = 10_000;

/**
 * Bloqueo de IP por intentos de login fallidos (401).
 * No sustituye a express-rate-limit: corta la IP que insiste con varias cuentas.
 * Estado en memoria; con varias instancias el bloqueo es por instancia (ver threat-model D4).
 */
export function ipBlocklist(options: IpBlocklistOptions): RequestHandler {
  if (options.threshold < 1 || options.windowMs < 1 || options.blockMs < 1) {
    throw new Error('ipBlocklist: threshold, windowMs y blockMs deben ser positivos');
  }

  const now = options.now ?? Date.now;
  const states = new Map<string, IpState>();
  let lastSweep = now();

  function sweep(instant: number): void {
    if (instant - lastSweep < SWEEP_INTERVAL_MS && states.size < MAX_TRACKED_IPS) return;
    lastSweep = instant;

    for (const [ip, state] of states) {
      state.failures = state.failures.filter((at) => instant - at < options.windowMs);
      if (state.blockedUntil <= instant && state.failures.length === 0) states.delete(ip);
    }

    if (states.size > MAX_TRACKED_IPS) {
      const excess = states.size - MAX_TRACKED_IPS;
      let removed = 0;
      for (const ip of states.keys()) {
        states.delete(ip);
        if (++removed >= excess) break;
      }
    }
  }

  return (req, res, next) => {
    const ip = req.ip;
    if (!ip) return next();

    const instant = now();
    sweep(instant);

    const state = states.get(ip);
    if (state && state.blockedUntil > instant) {
      const retryAfter = Math.max(1, Math.ceil((state.blockedUntil - instant) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return sendProblem(
        res,
        'rate_limited',
        'Demasiados intentos desde esta IP. Intenta de nuevo más tarde.',
      );
    }

    if (state && state.blockedUntil <= instant) {
      state.blockedUntil = 0;
      state.failures = state.failures.filter((at) => instant - at < options.windowMs);
      if (state.failures.length === 0) states.delete(ip);
    }

    res.on('finish', () => {
      const at = now();
      const current = states.get(ip) ?? { failures: [], blockedUntil: 0 };

      if (res.statusCode === 401) {
        current.failures = current.failures.filter((ts) => at - ts < options.windowMs);
        current.failures.push(at);
        if (current.failures.length >= options.threshold) {
          current.blockedUntil = at + options.blockMs;
          current.failures = [];
          options.log?.({
            level: 'warn',
            msg: 'auth.ip_blocked',
            ip,
            threshold: options.threshold,
            blockMs: options.blockMs,
            blockedUntil: new Date(current.blockedUntil).toISOString(),
          });
        }
        states.set(ip, current);
        return;
      }

      if (res.statusCode >= 200 && res.statusCode < 300) states.delete(ip);
    });

    return next();
  };
}
