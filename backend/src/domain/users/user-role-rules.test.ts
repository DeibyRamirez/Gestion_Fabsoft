import { describe, expect, it } from 'vitest';
import { applyUserChange, type UserState } from './user-role-rules.js';
import { assertValidNewPassword } from './password-policy.js';

const admin: UserState = { id: 'a', role: 'admin', clientId: null, status: 'active' };

describe('applyUserChange', () => {
  it('impide que un admin se quite el rol a sí mismo', () => {
    expect(() =>
      applyUserChange(admin, { role: 'operator' }, { actorUserId: 'a', activeAdminCount: 3 }),
    ).toThrow(/sí mismo/);
  });
  it('impide desactivar al último admin activo', () => {
    expect(() =>
      applyUserChange(admin, { status: 'disabled' }, { actorUserId: 'b', activeAdminCount: 1 }),
    ).toThrow(/al menos un admin/);
  });
  it('exige clientId para rol client', () => {
    expect(() =>
      applyUserChange(admin, { role: 'client' }, { actorUserId: 'b', activeAdminCount: 2 }),
    ).toThrow(/inconsistentes/);
  });
  it('limpia clientId al pasar de client a operator', () => {
    const client: UserState = { id: 'c', role: 'client', clientId: 'x', status: 'active' };
    expect(
      applyUserChange(client, { role: 'operator' }, { actorUserId: 'a', activeAdminCount: 1 })
        .clientId,
    ).toBeNull();
  });
});

describe('assertValidNewPassword', () => {
  it('rechaza contraseñas cortas o iguales al email', () => {
    expect(() => assertValidNewPassword('corta', 'a@b.co')).toThrow();
    expect(() => assertValidNewPassword('Admin@Fab.test', 'admin@fab.test')).toThrow();
    expect(() => assertValidNewPassword('una-contraseña-larga', 'a@b.co')).not.toThrow();
  });
});
