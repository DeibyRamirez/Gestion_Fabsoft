import type { ClientStatus } from '../../../domain/clients/client-status.js';
import type { ClientView } from '../shared/client-view.js';
import type { TaxIdConflict } from '../create-client/ports.js';

export interface ClientPatch {
  legalName?: string;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  ownerUserId?: string | null;
  status?: ClientStatus;
  updatedBy: string;
}

export type UpdateClientOutcome =
  | { ok: true; client: ClientView }
  | { ok: false; reason: 'client_tax_id_taken'; conflict: TaxIdConflict };

export interface UpdateClientRepository {
  loadForUpdate(id: string): Promise<ClientView | null>;
  findByTaxIdNormalized(
    normalized: string,
    excludeId: string,
  ): Promise<{ id: string; status: ClientStatus } | null>;
  save(id: string, p: ClientPatch): Promise<UpdateClientOutcome>;
}

export interface UpdateClientRepos {
  clientUpdate: UpdateClientRepository;
}