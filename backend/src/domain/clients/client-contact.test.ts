import { describe, expect, it } from 'vitest';
import {
  archivePrimaryBlocked,
  isContactReachable,
  resolveCreatePrimary,
  resolveReactivationPrimary,
} from './client-contact.js';

describe('client contact rules (RN-16)', () => {
  it('exige email o teléfono', () => {
    expect(isContactReachable({ email: 'a@b.co', phone: null })).toBe(true);
    expect(isContactReachable({ email: null, phone: '3001234567' })).toBe(true);
    expect(isContactReachable({ email: null, phone: null })).toBe(false);
    expect(isContactReachable({ email: '  ', phone: '  ' })).toBe(false);
  });

  it('el primer contacto activo es principal', () => {
    expect(resolveCreatePrimary(0, false)).toBe(true);
    expect(resolveCreatePrimary(2, false)).toBe(false);
    expect(resolveCreatePrimary(2, true)).toBe(true);
  });

  it('no archiva el principal si quedan otros contactos', () => {
    expect(archivePrimaryBlocked(true, 1)).toBe(true);
    expect(archivePrimaryBlocked(true, 0)).toBe(false);
    expect(archivePrimaryBlocked(false, 3)).toBe(false);
  });

  it('al reactivar mantiene exactamente un principal', () => {
    expect(resolveReactivationPrimary(true, 2)).toBe(true);
    expect(resolveReactivationPrimary(undefined, 0)).toBe(true);
    expect(resolveReactivationPrimary(undefined, 1)).toBe(false);
    expect(resolveReactivationPrimary(false, 0)).toBe(true);
  });
});
