import { CreateClientContact } from '../../application/clients/create-client-contact/use-case.js';
import { ListClientContacts } from '../../application/clients/list-client-contacts/use-case.js';
import { UpdateClientContact } from '../../application/clients/update-client-contact/use-case.js';
import type { Infra } from '../infra.js';

export function clientContactsModule(infra: Infra) {
  return {
    listClientContacts: new ListClientContacts(infra.userUow),
    createClientContact: new CreateClientContact(infra.userUow),
    updateClientContact: new UpdateClientContact(infra.userUow),
  };
}
