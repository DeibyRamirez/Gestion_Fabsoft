'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArchiveIcon, StarIcon, UsersIcon } from 'lucide-react';
import { ClientContactCreateSchema, type ClientContactDto } from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { ConfirmDialog } from '@/shared/components/action-dialog';
import { BentoCard } from '@/shared/components/bento';
import { EmptyState } from '@/shared/components/empty-state';
import { FormField } from '@/shared/components/form-field';
import { FormGrid } from '@/shared/components/form-layout';
import {
  MobileCard,
  MobileCardList,
  ResponsiveDataView,
} from '@/shared/components/responsive-data-view';
import { SectionHeader } from '@/shared/components/section-header';
import { initialsFromName } from '@/shared/components/user-avatar';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { ToneBadge } from '@/shared/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

type Props = {
  clientId: string;
  token: string | null;
  readOnly?: boolean;
};

function ContactAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-iris-soft text-[11px] font-bold text-iris"
    >
      {initialsFromName(name)}
    </span>
  );
}

export function ContactsPanel({ clientId, token, readOnly = false }: Props) {
  const [contacts, setContacts] = useState<ClientContactDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [toArchive, setToArchive] = useState<ClientContactDto | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    apiFetch<{ data: ClientContactDto[] }>(`/clients/${clientId}/contacts`, { token })
      .then((res) => {
        if (alive) setContacts(res.data);
      })
      .catch(() => {
        if (alive) setMessage('No se pudieron cargar los contactos.');
      });
    return () => {
      alive = false;
    };
  }, [clientId, token, version]);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const parsed = ClientContactCreateSchema.safeParse({
      fullName: String(data.get('fullName') ?? ''),
      email: String(data.get('email') ?? '').trim() || null,
      phone: String(data.get('phone') ?? '').trim() || null,
      roleTitle: String(data.get('roleTitle') ?? '').trim() || null,
      isPrimary: data.get('isPrimary') === 'on',
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setPending(true);
    try {
      await apiFetch<ClientContactDto>(`/clients/${clientId}/contacts`, {
        method: 'POST',
        token,
        body: JSON.stringify(parsed.data),
      });
      form.reset();
      setMessage('Contacto agregado.');
      reload();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo agregar el contacto.');
    } finally {
      setPending(false);
    }
  }

  async function setPrimary(contactId: string) {
    try {
      await apiFetch(`/clients/${clientId}/contacts/${contactId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ isPrimary: true }),
      });
      setMessage('Contacto principal actualizado.');
      reload();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo actualizar el contacto.');
    }
  }

  async function archive(contactId: string) {
    try {
      await apiFetch(`/clients/${clientId}/contacts/${contactId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ archived: true }),
      });
      setMessage('Contacto archivado.');
      reload();
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.problem?.code === 'primary_contact_conflict'
          ? 'Designe otro contacto principal antes de archivar el actual.'
          : 'No se pudo archivar el contacto.',
      );
    }
  }

  const desktop = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-2">Nombre</TableHead>
          <TableHead className="px-2">Email</TableHead>
          <TableHead className="px-2">Teléfono</TableHead>
          <TableHead className="px-2">Principal</TableHead>
          {readOnly ? null : (
            <TableHead className="w-20 px-2 text-right">
              <span className="sr-only">Acciones</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {contacts.map((contact) => (
          <TableRow key={contact.id}>
            <TableCell className="px-2 whitespace-nowrap">
              <span className="flex items-center gap-2">
                <ContactAvatar name={contact.fullName} />
                <span>
                  <span className="block font-semibold text-fg">{contact.fullName}</span>
                  {contact.roleTitle ? (
                    <span className="block text-xs text-fg-muted">{contact.roleTitle}</span>
                  ) : null}
                </span>
              </span>
            </TableCell>
            <TableCell className="max-w-[140px] px-2">
              {contact.email ? (
                <a
                  className="block truncate text-link hover:underline"
                  href={`mailto:${contact.email}`}
                  title={contact.email}
                >
                  {contact.email}
                </a>
              ) : (
                <span className="text-fg-muted">—</span>
              )}
            </TableCell>
            <TableCell className="px-2 whitespace-nowrap">
              {contact.phone ? (
                <span className="tabular font-mono text-xs">{contact.phone}</span>
              ) : (
                <span className="text-fg-muted">—</span>
              )}
            </TableCell>
            <TableCell className="px-2">
              {contact.isPrimary ? (
                <ToneBadge tone="success">Principal</ToneBadge>
              ) : (
                <span className="text-fg-muted">—</span>
              )}
            </TableCell>
            {readOnly ? null : (
              <TableCell className="px-2">
                <div className="flex justify-end gap-1">
                  {contact.isPrimary ? null : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="size-9 px-0"
                      aria-label={`Marcar como principal a ${contact.fullName}`}
                      onClick={() => void setPrimary(contact.id)}
                    >
                      <StarIcon aria-hidden />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="size-9 px-0 text-danger hover:bg-status-expired-bg"
                    aria-label={`Archivar a ${contact.fullName}`}
                    onClick={() => setToArchive(contact)}
                  >
                    <ArchiveIcon aria-hidden />
                  </Button>
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const mobile = (
    <MobileCardList>
      {contacts.map((contact) => (
        <MobileCard key={contact.id}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <ContactAvatar name={contact.fullName} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-fg">{contact.fullName}</p>
                {contact.roleTitle ? (
                  <p className="text-xs text-fg-muted">{contact.roleTitle}</p>
                ) : null}
              </div>
            </div>
            {contact.isPrimary ? <ToneBadge tone="success">Principal</ToneBadge> : null}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {contact.email ? (
              <a className="text-link hover:underline" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            ) : null}
            {contact.phone ? <span className="tabular font-mono">{contact.phone}</span> : null}
          </div>
          {readOnly ? null : (
            <div className="flex flex-wrap gap-2">
              {contact.isPrimary ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void setPrimary(contact.id)}
                >
                  Marcar principal
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-danger hover:bg-status-expired-bg"
                onClick={() => setToArchive(contact)}
              >
                Archivar
              </Button>
            </div>
          )}
        </MobileCard>
      ))}
    </MobileCardList>
  );

  return (
    <BentoCard>
      <SectionHeader title="Contactos" description="Personas de contacto del cliente." />
      {message ? (
        <p role="status" className="mt-3 text-sm text-fg-muted">
          {message}
        </p>
      ) : null}
      {contacts.length === 0 ? (
        <EmptyState icon={UsersIcon} title="Sin contactos registrados." className="mt-4" />
      ) : (
        <div className="mt-4">
          <ResponsiveDataView desktop={desktop} mobile={mobile} />
        </div>
      )}

      {readOnly ? null : (
        <form onSubmit={add} className="mt-5 border-t border-border pt-5">
          <FormGrid>
            <FormField label="Nombre completo" htmlFor="fullName">
              <Input id="fullName" name="fullName" required />
            </FormField>
            <FormField label="Email" htmlFor="contactEmail">
              <Input id="contactEmail" name="email" type="email" />
            </FormField>
            <FormField label="Teléfono" htmlFor="contactPhone">
              <Input id="contactPhone" name="phone" className="font-mono" />
            </FormField>
            <FormField label="Cargo" htmlFor="roleTitle">
              <Input id="roleTitle" name="roleTitle" />
            </FormField>
            <div className="flex items-center gap-2 md:col-span-2">
              <input
                id="isPrimary"
                name="isPrimary"
                type="checkbox"
                className="size-4 rounded border-border-input accent-[var(--color-iris)]"
              />
              <Label htmlFor="isPrimary">Contacto principal</Label>
            </div>
          </FormGrid>
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={pending}>
              Agregar contacto
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={toArchive !== null}
        onOpenChange={(open) => {
          if (!open) setToArchive(null);
        }}
        title="Archivar contacto"
        description={
          toArchive
            ? `¿Archivar a ${toArchive.fullName}? Dejará de aparecer como contacto activo.`
            : ''
        }
        confirmLabel="Archivar"
        destructive
        onConfirm={() => {
          if (toArchive) void archive(toArchive.id);
        }}
      />
    </BentoCard>
  );
}
