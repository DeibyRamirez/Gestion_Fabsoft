import type { PoolConfig } from 'pg';

/** Puerto de infraestructura que cambia entre Supabase y VPS (ADR-008 §4). */
export interface DatabaseConnectionProvider {
  readonly name: 'supabase' | 'postgres';
  poolConfig(): PoolConfig;
}

export interface DbSettings {
  url: string;
  sslMode: 'disable' | 'require' | 'verify-full';
  sslCa?: string | undefined;
  poolMax: number;
}

export function sslFor(settings: DbSettings): PoolConfig['ssl'] {
  if (settings.sslMode === 'disable') return false;
  if (settings.sslMode === 'require') return { rejectUnauthorized: false };
  return settings.sslCa
    ? { rejectUnauthorized: true, ca: settings.sslCa }
    : { rejectUnauthorized: true };
}
