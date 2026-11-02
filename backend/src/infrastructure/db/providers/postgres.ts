import type { PoolConfig } from 'pg';
import {
  sslFor,
  type DatabaseConnectionProvider,
  type DbSettings,
} from '../connection-provider.js';

/** PostgreSQL directo (docker local o VPS). */
export class DirectPostgresProvider implements DatabaseConnectionProvider {
  readonly name = 'postgres' as const;
  constructor(private readonly settings: DbSettings) {}
  poolConfig(): PoolConfig {
    return {
      connectionString: this.settings.url,
      ssl: sslFor(this.settings),
      max: this.settings.poolMax,
      idleTimeoutMillis: 30_000,
      application_name: 'fabsoft-api',
    };
  }
}
