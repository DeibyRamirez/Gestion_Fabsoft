import { describe, expect, it } from 'vitest';
import { initialsFromName } from '@/shared/components/user-avatar';

describe('initialsFromName', () => {
  it('genera dos iniciales con nombre y apellido', () => {
    expect(initialsFromName('Usuario de ejemplo')).toBe('UE');
  });

  it('usa las dos primeras letras si solo hay una palabra', () => {
    expect(initialsFromName('Admin')).toBe('AD');
  });
});
