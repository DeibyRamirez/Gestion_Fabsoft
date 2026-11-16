import type { UserActor } from '../../application/shared/actor.js';
import type { AuthUnitOfWork, UnitOfWork } from '../../application/shared/ports.js';
import { SystemContext, toRlsContext } from './rls-context.js';
import type { Tx, WithRlsContext } from './with-rls-context.js';

/** UnitOfWork de actor humano: withRlsContext(toRlsContext(actor), tx => work(factory(tx))). */
export class PgUnitOfWork<R> implements UnitOfWork<R> {
  constructor(
    private readonly withRlsContext: WithRlsContext,
    private readonly factory: (tx: Tx) => R,
  ) {}
  run<T>(actor: UserActor, work: (repos: R) => Promise<T>): Promise<T> {
    return this.withRlsContext(toRlsContext(actor), (tx) => work(this.factory(tx)));
  }
}

/** UnitOfWork en contexto system: `auth` (servicio de autenticación) o `worker` (jobs, purgas). */
export class PgSystemUnitOfWork<R> implements AuthUnitOfWork<R> {
  constructor(
    private readonly withRlsContext: WithRlsContext,
    private readonly factory: (tx: Tx) => R,
    private readonly purpose: 'auth' | 'worker' = 'auth',
  ) {}
  run<T>(requestId: string, work: (repos: R) => Promise<T>, clientRequestId?: string): Promise<T> {
    return this.withRlsContext(
      { ...SystemContext[this.purpose](requestId), clientRequestId },
      (tx) => work(this.factory(tx)),
    );
  }
}
