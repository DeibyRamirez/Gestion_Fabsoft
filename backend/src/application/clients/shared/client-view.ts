import type { ClientStatus } from '../../../domain/clients/client-status.js';

export interface ClientOwnerRef {
  id: string;
  fullName: string;
}

/** Proyección de cliente para la API (sin contactos ni resumen). */
export interface ClientView {
  id: string;
  legalName: string;
  taxId: string | null;
  status: ClientStatus;
  email: string | null;
  phone: string | null;
  owner: ClientOwnerRef | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}