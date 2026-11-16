import type { ClientContactView } from '../shared/client-contact-view.js';

export interface ClientContactPatch {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  isPrimary?: boolean;
  archivedAt?: Date | null;
}

export interface UpdateClientContactRepository {
  loadForUpdate(clientId: string, contactId: string): Promise<ClientContactView | null>;
  countOtherActive(clientId: string, contactId: string): Promise<number>;
  countOtherPrimary(clientId: string, contactId: string): Promise<number>;
  clearPrimary(clientId: string): Promise<void>;
  save(contactId: string, patch: ClientContactPatch): Promise<ClientContactView>;
}

export interface UpdateClientContactRepos {
  clientContactUpdate: UpdateClientContactRepository;
}
