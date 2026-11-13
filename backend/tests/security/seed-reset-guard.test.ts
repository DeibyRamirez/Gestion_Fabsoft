/**
 * seed --reset fail-closed (ronda 6): no borrar BDs sin marcador / sin coincidir con seed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertSeedConfiguration,
  assertSeedResetProvisionerTarget,
} from '../../scripts/guard.js';
import { parseDatabaseTarget } from '../../scripts/database-url.js';

const ownerUrl = process.env.DATABASE_PROVISION_URL;
const seedUrl = process.env.SEED_DATABASE_URL;
const marker = process.env.SEED_EPHEMERAL_MARKER;
const runId = process.env.SEED_HARNESS_RUN_ID;
const db = process.env.SEED_ALLOWED_DATABASES?.split(',')[0] ?? 'fabsoft_test';

if (process.env.REQUIRE_DB_TESTS === '1' && (!ownerUrl || !seedUrl || !marker || !runId)) {
  throw new Error('seed-reset-guard: entorno harness seed incompleto');
}

afterEach(() => {
  if (ownerUrl) process.env.DATABASE_PROVISION_URL = ownerUrl;
});

describe.skipIf(!ownerUrl || !seedUrl)('seed --reset guard', () => {
  it('rechaza reset si procedencia harness no coincide (sin TRUNCATE)', async () => {
    const target = parseDatabaseTarget(seedUrl!);
    Object.assign(process.env, {
      APP_ENV: 'test',
      SEED_ALLOWED_HOSTS: target.host,
      SEED_ALLOWED_PORTS: target.port,
      SEED_FORBIDDEN_HOSTS: 'prod.example.com',
      SEED_ALLOW_RESET: '1',
      SEED_SESSION_ROLE: 'fabsoft_seed_writer',
      SEED_DATABASE_URL: seedUrl,
      SEED_ALLOWED_DATABASES: db,
      SEED_EPHEMERAL_MARKER: marker,
      SEED_HARNESS_RUN_ID: 'run-inventado-no-harness',
      DATABASE_PROVISION_URL: ownerUrl,
    });
    const cfg = assertSeedConfiguration();
    await expect(assertSeedResetProvisionerTarget(cfg)).rejects.toThrow(/procedencia|marcador/i);
  });
});
