import type { ClientView } from '../../../../application/clients/shared/client-view.js';
import type { ClientStatus } from '../../../../domain/clients/client-status.js';

export const CLIENT_COLUMNS = `c.id, c.legal_name, c.tax_id, c.status, c.email, c.phone,
  c.owner_user_id, c.archived_at, c.created_at, c.updated_at,
  u.id as owner_id, u.full_name as owner_full_name`;

export interface ClientRow {
  id: string;
  legal_name: string;
  tax_id: string | null;
  status: ClientStatus;
  email: string | null;
  phone: string | null;
  owner_user_id: string | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
  owner_id: string | null;
  owner_full_name: string | null;
}

export const toClientView = (r: ClientRow): ClientView => ({
  id: r.id,
  legalName: r.legal_name,
  taxId: r.tax_id,
  status: r.status,
  email: r.email,
  phone: r.phone,
  owner:
    r.owner_id && r.owner_full_name
      ? { id: r.owner_id, fullName: r.owner_full_name }
      : r.owner_user_id
        ? { id: r.owner_user_id, fullName: '' }
        : null,
  archivedAt: r.archived_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});