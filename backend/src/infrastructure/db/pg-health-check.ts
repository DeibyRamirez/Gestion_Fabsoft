import type pg from 'pg';
import type { DependencyCheck } from '../../application/health/get-readiness/ports.js';

/** `select 1` con el rol de la app y timeout de 1 s (docs/observability.md §3). No toca tablas: no requiere contexto RLS. */
export class PgDatabaseCheck implements DependencyCheck {
  readonly name = 'database';
  constructor(
    private readonly pool: pg.Pool,
    private readonly timeoutMs = 1000,
  ) {}

  async check(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), this.timeoutMs);
    });
    const ping = this.pool
      .query('select 1')
      .then(() => true)
      .catch(() => false);
    try {
      return await Promise.race([ping, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
