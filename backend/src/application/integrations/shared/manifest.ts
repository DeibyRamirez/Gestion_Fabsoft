import type { IntegrationManifest } from '@fabsoft/shared';
import { ApplicationError } from '../../shared/application-error.js';
import type { IntegrationClientQuery } from './ports.js';

const parse = (version: string): number[] => version.split('.').map(Number);

/** Compara semver `a` con `b`: negativo si a<b, 0 si igual, positivo si a>b. */
export function compareSemver(a: string, b: string): number {
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function assertManifestVersion(previous: string, next: string): void {
  if (compareSemver(next, previous) <= 0) {
    throw new ApplicationError(
      'manifest_invalid',
      'La nueva versión del manifest debe ser estrictamente mayor',
    );
  }
}

export function assertManifestSlug(current: string, manifest: IntegrationManifest): void {
  if (manifest.integration !== current) {
    throw new ApplicationError('manifest_invalid', 'El slug de la integración es inmutable');
  }
}

export async function assertManifestClients(
  query: IntegrationClientQuery,
  manifest: IntegrationManifest,
): Promise<void> {
  if (manifest.client_scope !== 'own') return;
  const ids = manifest.client_ids ?? [];
  const statuses = await query.findClientStatuses(ids);
  const invalid = ids.filter((id) => {
    const status = statuses.get(id);
    return !status || status === 'archivado';
  });
  if (invalid.length > 0) {
    throw new ApplicationError(
      'manifest_invalid',
      'Todos los client_ids deben existir y no estar archivados',
      { clientIds: invalid },
    );
  }
}
