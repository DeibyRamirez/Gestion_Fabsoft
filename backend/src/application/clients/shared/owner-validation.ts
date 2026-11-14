import type { GetUserQuery } from '../../users/get-user/ports.js';
import { ApplicationError } from '../../shared/application-error.js';

/** Responsable interno: usuario admin u operator activo. */
export async function assertInternalOwner(
  userDetail: GetUserQuery,
  ownerUserId: string | null | undefined,
): Promise<void> {
  if (ownerUserId === undefined || ownerUserId === null) return;
  const user = await userDetail.findById(ownerUserId);
  if (!user || user.status !== 'active' || (user.role !== 'admin' && user.role !== 'operator')) {
    throw new ApplicationError('validation_error', 'Responsable interno inválido');
  }
}