import { AsyncLocalStorage } from 'node:async_hooks';
import type pg from 'pg';
import type { RlsContext } from './rls-context.js';

export class TxClosedError extends Error {}
export class NestedRlsContextError extends Error {}

/** Transacción contextualizada; deja de funcionar al cerrar (ADR-004). */
export interface Tx {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

const active = new AsyncLocalStorage<true>();
const RETRYABLE = new Set(['40001', '40P01']);
const BACKOFF_MS = [50, 100, 200];

function params(ctx: RlsContext, timeoutMs: number): unknown[] {
  switch (ctx.actorType) {
    case 'user':
      return ['user', ctx.role, ctx.userId, ctx.clientId, null, ctx.requestId, `${timeoutMs}`];
    case 'integration':
      return [
        'integration',
        'integration',
        null,
        null,
        ctx.integrationId,
        ctx.requestId,
        `${timeoutMs}`,
      ];
    case 'system':
      return ['system', 'system', null, null, null, ctx.requestId, `${timeoutMs}`];
  }
}

const SET_CONTEXT = `select set_config('app.actor_type', $1, true),
       set_config('app.actor_role', $2, true),
       set_config('app.current_user_id', coalesce($3, ''), true),
       set_config('app.client_id', coalesce($4, ''), true),
       set_config('app.integration_id', coalesce($5, ''), true),
       set_config('app.request_id', $6, true),
       set_config('statement_timeout', $7, true)`;

export function createWithRlsContext(pool: pg.Pool, statementTimeoutMs = 5000) {
  return async function withRlsContext<T>(ctx: RlsContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (active.getStore()) throw new NestedRlsContextError('withRlsContext no admite anidamiento');
    for (let attempt = 0; ; attempt++) {
      const client = await pool.connect();
      let open = true;
      const tx: Tx = {
        query: (text, values) => {
          if (!open) throw new TxClosedError('La transacción ya terminó');
          return client.query(text, values);
        },
      };
      try {
        await client.query('begin');
        await client.query(SET_CONTEXT, params(ctx, statementTimeoutMs));
        const result = await active.run(true, () => fn(tx));
        await client.query('commit');
        return result;
      } catch (err) {
        await client.query('rollback').catch(() => undefined);
        const code = (err as { code?: string }).code;
        if (code && RETRYABLE.has(code) && attempt < BACKOFF_MS.length) {
          await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
          continue;
        }
        throw err;
      } finally {
        open = false;
        client.release();
      }
    }
  };
}

export type WithRlsContext = ReturnType<typeof createWithRlsContext>;
