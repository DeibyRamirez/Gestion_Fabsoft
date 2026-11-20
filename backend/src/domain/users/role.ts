/** Roles humanos (docs/security/permissions-matrix.md). */
export type Role = 'admin' | 'operator' | 'client';
export type UserStatus = 'activo' | 'deshabilitado';

export const isInternalRole = (role: Role): boolean => role === 'admin' || role === 'operator';
