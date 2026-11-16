/** Reglas de contactos de cliente (RN-16): exactamente un principal por cliente. */

export interface ContactReachability {
  email: string | null;
  phone: string | null;
}

/** Un contacto debe ser alcanzable: email o teléfono (constraint `client_contacts_reachable`). */
export function isContactReachable(contact: ContactReachability): boolean {
  const email = contact.email?.trim();
  const phone = contact.phone?.trim();
  return Boolean(email) || Boolean(phone);
}

/** El primer contacto activo de un cliente siempre queda como principal (RN-16). */
export function resolveCreatePrimary(activeContactCount: number, requested: boolean): boolean {
  return activeContactCount === 0 ? true : requested;
}

/** No se puede archivar al principal si quedan otros contactos sin designar reemplazo (RN-16). */
export function archivePrimaryBlocked(isPrimary: boolean, otherActiveCount: number): boolean {
  return isPrimary && otherActiveCount > 0;
}

/** Al reactivar se conserva exactamente un principal; si no hay otro, este lo es. */
export function resolveReactivationPrimary(
  requestedPrimary: boolean | undefined,
  otherActivePrimaryCount: number,
): boolean {
  if (requestedPrimary === true) return true;
  return otherActivePrimaryCount === 0;
}
