import { describe, expect, it } from 'vitest';
import {
  assertManifestClients,
  assertManifestSlug,
  assertManifestVersion,
  compareSemver,
} from './manifest.js';
import type { IntegrationManifest } from '@fabsoft/shared';

const manifest: IntegrationManifest = {
  manifest_schema_version: 1,
  integration: 'erp',
  version: '1.1.0',
  display_name: 'ERP',
  scopes: ['clients:read'],
  client_scope: 'own',
  client_ids: ['00000000-0000-4000-8000-000000000001'],
  rate_limit_per_minute: 60,
};

describe('manifest semántico', () => {
  it('compara semver y exige versión creciente', () => {
    expect(compareSemver('1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(() => assertManifestVersion('1.2.0', '1.2.0')).toThrow(/estrictamente mayor/);
    expect(() => assertManifestVersion('1.2.0', '1.3.0')).not.toThrow();
  });

  it('mantiene el slug inmutable', () => {
    expect(() => assertManifestSlug('erp', manifest)).not.toThrow();
    expect(() => assertManifestSlug('otro', manifest)).toThrow(/inmutable/);
  });

  it('valida clientes existentes y no archivados', async () => {
    const query = {
      findClientStatuses: async () =>
        new Map([['00000000-0000-4000-8000-000000000001', 'activo' as const]]),
    };
    await expect(assertManifestClients(query, manifest)).resolves.toBeUndefined();
    await expect(
      assertManifestClients(
        {
          findClientStatuses: async () =>
            new Map([['00000000-0000-4000-8000-000000000001', 'archivado' as const]]),
        },
        manifest,
      ),
    ).rejects.toMatchObject({ code: 'manifest_invalid' });
  });
});
