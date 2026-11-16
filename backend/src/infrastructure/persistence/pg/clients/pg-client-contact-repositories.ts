import type {
  CreateClientContactRepository,
  NewClientContact,
} from '../../../../application/clients/create-client-contact/ports.js';
import type { ListClientContactsQuery } from '../../../../application/clients/list-client-contacts/ports.js';
import type {
  ClientContactPatch,
  UpdateClientContactRepository,
} from '../../../../application/clients/update-client-contact/ports.js';
import type { ClientContactView } from '../../../../application/clients/shared/client-contact-view.js';
import { ApplicationError } from '../../../../application/shared/application-error.js';
import type { Tx } from '../../../db/with-rls-context.js';
import { PG, pgCode } from '../shared/pg-errors.js';

const CONTACT_COLUMNS = `id, client_id, full_name, email, phone, role_title, is_primary, archived_at`;

interface ClientContactRow {
  id: string;
  client_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  is_primary: boolean;
  archived_at: Date | null;
}

const toView = (r: ClientContactRow): ClientContactView => ({
  id: r.id,
  clientId: r.client_id,
  fullName: r.full_name,
  email: r.email,
  phone: r.phone,
  roleTitle: r.role_title,
  isPrimary: r.is_primary,
  archivedAt: r.archived_at,
});

async function count(tx: Tx, sql: string, values: unknown[]): Promise<number> {
  const { rows } = await tx.query<{ n: number }>(sql, values);
  return Number(rows[0]?.n ?? 0);
}

export class PgListClientContactsQuery implements ListClientContactsQuery {
  constructor(private readonly tx: Tx) {}
  async list(clientId: string, includeArchived: boolean): Promise<ClientContactView[]> {
    const { rows } = await this.tx.query<ClientContactRow>(
      `select ${CONTACT_COLUMNS}
         from app.client_contacts
         where client_id = $1 and ($2::boolean or archived_at is null)
         order by is_primary desc, full_name asc, id`,
      [clientId, includeArchived],
    );
    return rows.map(toView);
  }
}

export class PgCreateClientContactRepository implements CreateClientContactRepository {
  constructor(private readonly tx: Tx) {}
  async countActive(clientId: string): Promise<number> {
    return count(
      this.tx,
      `select count(*)::int as n from app.client_contacts where client_id = $1 and archived_at is null`,
      [clientId],
    );
  }
  async clearPrimary(clientId: string): Promise<void> {
    await this.tx.query(
      `update app.client_contacts set is_primary = false
        where client_id = $1 and is_primary and archived_at is null`,
      [clientId],
    );
  }
  async insert(c: NewClientContact): Promise<ClientContactView> {
    try {
      const { rows } = await this.tx.query<ClientContactRow>(
        `insert into app.client_contacts (client_id, full_name, email, phone, role_title, is_primary)
         values ($1, $2, $3, $4, $5, $6)
         returning ${CONTACT_COLUMNS}`,
        [c.clientId, c.fullName, c.email, c.phone, c.roleTitle, c.isPrimary],
      );
      return toView(rows[0]!);
    } catch (err) {
      if (pgCode(err) === PG.uniqueViolation) {
        throw new ApplicationError(
          'primary_contact_conflict',
          'El cliente ya tiene otro contacto principal',
        );
      }
      throw err;
    }
  }
}

export class PgUpdateClientContactRepository implements UpdateClientContactRepository {
  constructor(private readonly tx: Tx) {}
  async loadForUpdate(clientId: string, contactId: string): Promise<ClientContactView | null> {
    const { rows } = await this.tx.query<ClientContactRow>(
      `select ${CONTACT_COLUMNS} from app.client_contacts
        where id = $1 and client_id = $2 for update`,
      [contactId, clientId],
    );
    return rows[0] ? toView(rows[0]) : null;
  }
  async countOtherActive(clientId: string, contactId: string): Promise<number> {
    return count(
      this.tx,
      `select count(*)::int as n from app.client_contacts
        where client_id = $1 and id <> $2 and archived_at is null`,
      [clientId, contactId],
    );
  }
  async countOtherPrimary(clientId: string, contactId: string): Promise<number> {
    return count(
      this.tx,
      `select count(*)::int as n from app.client_contacts
        where client_id = $1 and id <> $2 and is_primary and archived_at is null`,
      [clientId, contactId],
    );
  }
  async clearPrimary(clientId: string): Promise<void> {
    await this.tx.query(
      `update app.client_contacts set is_primary = false
        where client_id = $1 and is_primary and archived_at is null`,
      [clientId],
    );
  }
  async save(contactId: string, p: ClientContactPatch): Promise<ClientContactView> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (p.fullName !== undefined) set('full_name', p.fullName);
    if (p.email !== undefined) set('email', p.email);
    if (p.phone !== undefined) set('phone', p.phone);
    if (p.roleTitle !== undefined) set('role_title', p.roleTitle);
    if (p.isPrimary !== undefined) set('is_primary', p.isPrimary);
    if (p.archivedAt !== undefined) set('archived_at', p.archivedAt);

    if (sets.length === 0) {
      const { rows } = await this.tx.query<ClientContactRow>(
        `select ${CONTACT_COLUMNS} from app.client_contacts where id = $1`,
        [contactId],
      );
      if (!rows[0]) throw new Error('contacto no encontrado');
      return toView(rows[0]);
    }
    values.push(contactId);
    try {
      const { rows } = await this.tx.query<ClientContactRow>(
        `update app.client_contacts set ${sets.join(', ')}
          where id = $${values.length}
          returning ${CONTACT_COLUMNS}`,
        values,
      );
      if (!rows[0]) throw new Error('contacto no encontrado');
      return toView(rows[0]);
    } catch (err) {
      if (pgCode(err) === PG.uniqueViolation) {
        throw new ApplicationError(
          'primary_contact_conflict',
          'El cliente ya tiene otro contacto principal',
        );
      }
      throw err;
    }
  }
}
