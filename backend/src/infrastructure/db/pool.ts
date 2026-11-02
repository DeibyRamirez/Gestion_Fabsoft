import pg from 'pg';
import type { DatabaseConnectionProvider } from './connection-provider.js';

/** Pool singleton de infraestructura (ADR-006). No se exporta fuera de infrastructure/db. */
export function createPool(provider: DatabaseConnectionProvider): pg.Pool {
  return new pg.Pool(provider.poolConfig());
}
