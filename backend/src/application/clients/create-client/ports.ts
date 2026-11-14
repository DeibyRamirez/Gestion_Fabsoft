import type { ClientStatus } from '../../../domain/clients/client-status.js';
import type { ClientView } from '../shared/client-view.js';

export interface NewClient {
  legalName: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  ownerUserId: string | null;
  status: ClientStatus;
  createdBy: string;
}

export type TaxIdConflict = {
  existingClientId: string;
  archived: boolean;
};

export type CreateClientOutcome =
  | { ok: true; client: ClientView }
  | { ok: false; reason: 'client_tax_id_taken'; conflict: TaxIdConflict };

export interface CreateClientRepository {
  findByTaxIdNormalized(normalized: string): Promise<{ id: string; status: ClientStatus } | null>;
  insert(u: NewClient): Promise<CreateClientOutcome>;
}

export interface CreateClientRepos {
  clientCreate: CreateClientRepository;
}
