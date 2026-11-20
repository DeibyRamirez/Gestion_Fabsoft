import { describe, expect, it } from 'vitest';
import { canArchiveClient, canReactivateClient, isArchived } from './client.js';

describe('client transitions', () => {
  it('archivar sólo desde activo/inactivo', () => {
    expect(canArchiveClient('activo')).toBe(true);
    expect(canArchiveClient('inactivo')).toBe(true);
    expect(canArchiveClient('archivado')).toBe(false);
  });

  it('reactivar desde archivado/inactivo', () => {
    expect(canReactivateClient('archivado')).toBe(true);
    expect(canReactivateClient('inactivo')).toBe(true);
    expect(canReactivateClient('activo')).toBe(false);
  });

  it('isArchived', () => {
    expect(isArchived('archivado')).toBe(true);
    expect(isArchived('activo')).toBe(false);
  });
});
