/** Roles humanos (docs/security/permissions-matrix.md). */
export type Role = 'admin' | 'operator' | 'client';
export type UserStatus = 'active' | 'disabled';

export const isInternalRole = (role: Role): boolean => role === 'admin' || role === 'operator';
