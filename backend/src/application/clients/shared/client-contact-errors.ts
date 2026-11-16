import { ApplicationError } from '../../shared/application-error.js';

export function primaryContactConflictError(
  message = 'El cliente ya tiene otro contacto principal',
): ApplicationError {
  return new ApplicationError('primary_contact_conflict', message);
}
