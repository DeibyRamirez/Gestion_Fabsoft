import type { TaxIdConflict } from '../create-client/ports.js';
import { ApplicationError } from '../../shared/application-error.js';

export function clientTaxIdTakenError(conflict: TaxIdConflict): ApplicationError {
  return new ApplicationError(
    'client_tax_id_taken',
    'Ya existe un cliente con esa identificación fiscal',
    {
      existingClientId: conflict.existingClientId,
      archived: conflict.archived,
    },
  );
}
