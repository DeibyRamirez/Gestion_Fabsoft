'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ClientContactCreateSchema, type ClientContactDto } from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

type Props = {
  clientId: string;
  token: string | null;
  readOnly?: boolean;
};

export function ContactsPanel({ clientId, token, readOnly = false }: Props) {
  const [contacts, setContacts] = useState<ClientContactDto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Contactos</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {message ? (
          <p role="status" className="text-sm">
            {message}
          </p>
        ) : null}
        {contacts.length === 0 ? (
          <p className="text-sm text-fg-muted">Sin contactos registrados.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Principal</TableHead>
                {readOnly ? null : <TableHead>Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.fullName}</TableCell>
                  <TableCell>{c.email ?? '—'}</TableCell>
                  <TableCell>{c.phone ?? '—'}</TableCell>
                  <TableCell>
                    {c.isPrimary ? <Badge variant="active">Principal</Badge> : '—'}
                  </TableCell>
                  {readOnly ? null : (
                    <TableCell className="flex gap-2">
                      {c.isPrimary ? null : (
                        <Button type="button" variant="outline" onClick={() => setPrimary(c.id)}>
                          Marcar principal
                        </Button>
                      )}
                      <Button type="button" variant="destructive" onClick={() => archive(c.id)}>
                        Archivar
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {readOnly ? null : (
          <form onSubmit={add} className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="fullName">Nombre completo</Label>
              <Input id="fullName" name="fullName" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contactEmail">Email</Label>
              <Input id="contactEmail" name="email" type="email" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contactPhone">Teléfono</Label>
              <Input id="contactPhone" name="phone" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="roleTitle">Cargo</Label>
              <Input id="roleTitle" name="roleTitle" />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <input id="isPrimary" name="isPrimary" type="checkbox" className="h-4 w-4" />
              <Label htmlFor="isPrimary">Contacto principal</Label>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={pending}>
                Agregar contacto
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
