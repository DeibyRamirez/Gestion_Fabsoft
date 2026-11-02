import type { PoolConfig } from 'pg';
import {
  sslFor,
  type DatabaseConnectionProvider,
  type DbSettings,
} from '../connection-provider.js';

/** Supavisor en modo transacción (6543): compatible con set_config local por transacción. */
export class SupabasePoolerProvider implements DatabaseConnectionProvider {
  readonly name = 'supabase' as const;
  constructor(private readonly settings: DbSettings) {}
  poolConfig(): PoolConfig {
    return {
      connectionString: this.settings.url,
      ssl: sslFor({
        ...this.settings,
        sslMode: this.settings.sslMode === 'disable' ? 'require' : this.settings.sslMode,
      }),
      max: this.settings.poolMax,
      idleTimeoutMillis: 10_000,
      application_name: 'fabsoft-api',
    };
  }
}
