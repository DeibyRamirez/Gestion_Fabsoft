import type { ClientContactView } from '../shared/client-contact-view.js';

export interface NewClientContact {
  clientId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  isPrimary: boolean;
}

export interface CreateClientContactRepository {
  countActive(clientId: string): Promise<number>;
  clearPrimary(clientId: string): Promise<void>;
  insert(contact: NewClientContact): Promise<ClientContactView>;
}

export interface CreateClientContactRepos {
  clientContactCreate: CreateClientContactRepository;
}
