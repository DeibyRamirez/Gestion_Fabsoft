import {
  ClientContactCreateSchema,
  ClientContactListQuerySchema,
  ClientContactUpdateSchema,
  type ClientContactDto,
} from '@fabsoft/shared';
import { API_VERSION_PREFIX } from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { CreateClientContact } from '../../../../application/clients/create-client-contact/use-case.js';
import type { ListClientContacts } from '../../../../application/clients/list-client-contacts/use-case.js';
import type { ClientContactView } from '../../../../application/clients/shared/client-contact-view.js';
import type { UpdateClientContact } from '../../../../application/clients/update-client-contact/use-case.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface ClientContactsRouteDeps {
  listClientContacts: ListClientContacts;
  createClientContact: CreateClientContact;
  updateClientContact: UpdateClientContact;
}

const IdSchema = z.string().uuid();

export const toClientContactDto = (c: ClientContactView): ClientContactDto => ({
  id: c.id,
  clientId: c.clientId,
  fullName: c.fullName,
  email: c.email,
  phone: c.phone,
  roleTitle: c.roleTitle,
  isPrimary: c.isPrimary,
  archivedAt: c.archivedAt?.toISOString() ?? null,
});

/** Contactos: lectura y escritura admin+operator (RN-16, RN-14). */
export function clientContactsRouter(
  deps: ClientContactsRouteDeps,
  guards: RequestHandler[],
): Router {
  const router = Router();
  const readGuards = [...guards, requireRole('admin', 'operator')];
  const writeGuards = [...guards, requireRole('admin', 'operator')];

  router.get('/clients/:id/contacts', ...readGuards, async (req, res) => {
    const { includeArchived } = ClientContactListQuerySchema.parse(req.query);
    const contacts = await deps.listClientContacts.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      includeArchived,
    );
    res.json({ data: contacts.map(toClientContactDto) });
  });

  router.post('/clients/:id/contacts', ...writeGuards, async (req, res) => {
    const contact = await deps.createClientContact.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      ClientContactCreateSchema.parse(req.body),
    );
    res.setHeader(
      'Location',
      `${API_VERSION_PREFIX}/clients/${contact.clientId}/contacts/${contact.id}`,
    );
    res.status(201).json(toClientContactDto(contact));
  });

  router.patch('/clients/:id/contacts/:contactId', ...writeGuards, async (req, res) => {
    const contact = await deps.updateClientContact.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      IdSchema.parse(req.params.contactId),
      ClientContactUpdateSchema.parse(req.body),
    );
    res.json(toClientContactDto(contact));
  });

  return router;
}
