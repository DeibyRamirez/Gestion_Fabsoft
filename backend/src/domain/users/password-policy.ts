import { DomainError } from '../shared/domain-error.js';

export const MIN_PASSWORD_LENGTH = 12;

/** Política de contraseña nueva: ≥12 caracteres y distinta del email (ChangePasswordInput). */
export function assertValidNewPassword(password: string, email: string, current?: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new DomainError('validation_error', 'La contraseña es demasiado corta', [
      { path: 'newPassword', message: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres` },
    ]);
  }
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) {
    throw new DomainError('validation_error', 'La contraseña no puede ser el email', [
      { path: 'newPassword', message: 'No puede coincidir con el email' },
    ]);
  }
  if (current !== undefined && password === current) {
    throw new DomainError('validation_error', 'La contraseña nueva debe ser distinta', [
      { path: 'newPassword', message: 'Debe ser distinta de la actual' },
    ]);
  }
}
