/**
 * seed --reset fail-closed (ronda 6): no borrar BDs sin marcador / sin coincidir con seed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { assertSeedResetProvisionerTarget } from '../../scripts/guard.js';
import { parseDatabaseTarget } from '../../scripts/database-url.js';

const ownerUrl = process.env.DATABASE_PROVISION_URL;

function resolveSeedWriterUrl(): string | undefined {
  const raw = process.env.SEED_DATABASE_URL?.trim();
  if (raw && parseDatabaseTarget(raw).user === 'fabsoft_seed_writer') return raw;
  if (!ownerUrl) return undefined;
  const t = parseDatabaseTarget(ownerUrl);
  return `postgres://fabsoft_seed_writer@${t.host}:${t.port}/${encodeURIComponent(t.database)}?sslmode=disable`;
}

const seedUrl = resolveSeedWriterUrl();
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
    const cfg = {
      url: seedUrl!,
      expectedSessionRole: 'fabsoft_seed_writer',
      ephemeralMarker: marker!,
      harnessRunId: 'run-inventado-no-harness',
      expectedDatabase: db,
    };
    await expect(assertSeedResetProvisionerTarget(cfg)).rejects.toThrow(/procedencia|marcador/i);
  });
});
