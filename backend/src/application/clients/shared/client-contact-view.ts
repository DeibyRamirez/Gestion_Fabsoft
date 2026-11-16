/** Proyección de contacto para la API (docs/api/openapi.yaml ClientContact). */
export interface ClientContactView {
  id: string;
  clientId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  isPrimary: boolean;
  archivedAt: Date | null;
}
