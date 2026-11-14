import { describe, expect, it } from 'vitest';
import { canArchiveClient, canReactivateClient, isArchived } from './client.js';

describe('client transitions', () => {
  it('archivar sólo desde active/inactive', () => {
    expect(canArchiveClient('active')).toBe(true);
    expect(canArchiveClient('inactive')).toBe(true);
    expect(canArchiveClient('archived')).toBe(false);
  });

  it('reactivar desde archived/inactive', () => {
    expect(canReactivateClient('archived')).toBe(true);
    expect(canReactivateClient('inactive')).toBe(true);
    expect(canReactivateClient('active')).toBe(false);
  });

  it('isArchived', () => {
    expect(isArchived('archived')).toBe(true);
    expect(isArchived('active')).toBe(false);
  });
});