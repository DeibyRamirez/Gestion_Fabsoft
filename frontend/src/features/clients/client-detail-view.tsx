'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClientArchiveSchema,
  ClientUpdateSchema,
  type ClientDto,
} from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

export function ClientDetailView({ clientId }: { clientId: string }) {
  const { token, user } = useAuth();
  const router = useRouter();
  const [client, setClient] = useState<ClientDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    let alive = true;
    apiFetch<ClientDto>(`/clients/${clientId}`, { token })
      .then((c) => alive && setClient(c))
      .catch(() => alive && setMessage('Cliente no encontrado.'));
    return () => {
      alive = false;
    };
  }, [clientId, token]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client) return;
    const data = new FormData(e.currentTarget);
    const parsed = ClientUpdateSchema.safeParse({
      legalName: data.get('legalName'),
      taxId: (data.get('taxId') as string) || null,
      email: (data.get('email') as string) || null,
      phone: (data.get('phone') as string) || null,
      status: data.get('status'),
    });
    if (!parsed.success) return setMessage('Datos inválidos');
    try {
      const updated = await apiFetch<ClientDto>(`/clients/${clientId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(parsed.data),
      });
      setClient(updated);
      setMessage('Cambios guardados.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  }

  async function archive() {
    const reason = window.prompt('Motivo del archivo (mín. 3 caracteres)');
    if (!reason) return;
    const parsed = ClientArchiveSchema.safeParse({ reason });
    if (!parsed.success) return setMessage('Motivo inválido');
    try {
      const updated = await apiFetch<ClientDto>(`/clients/${clientId}/archive`, {
        method: 'POST',
        token,
        body: JSON.stringify(parsed.data),
      });
      setClient(updated);
      setMessage('Cliente archivado.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo archivar');
    }
  }

  async function reactivate() {
    try {
      const updated = await apiFetch<ClientDto>(`/clients/${clientId}/reactivate`, {
        method: 'POST',
        token,
      });
      setClient(updated);
      setMessage('Cliente reactivado.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'No se pudo reactivar');
    }
  }

  if (!client) return <p>{message ?? 'Cargando…'}</p>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        breadcrumbs={['Gestión', 'Clientes']}
        title={client.legalName}
        description={`Estado: ${client.status}`}
      />
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Datos</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="legalName">Razón social</Label>
              <Input id="legalName" name="legalName" defaultValue={client.legalName} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="taxId">NIT</Label>
              <Input id="taxId" name="taxId" defaultValue={client.taxId ?? ''} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={client.email ?? ''} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" name="phone" defaultValue={client.phone ?? ''} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Estado</Label>
              <select
                id="status"
                name="status"
                defaultValue={client.status === 'archived' ? 'inactive' : client.status}
                disabled={client.status === 'archived'}
                className="flex h-10 w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm"
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>
            <Button type="submit" disabled={client.status === 'archived'}>
              Guardar
            </Button>
          </form>
        </CardContent>
      </Card>
      {isAdmin ? (
        <div className="flex gap-3">
          {client.status !== 'archived' ? (
            <Button type="button" variant="destructive" onClick={archive}>
              Archivar
            </Button>
          ) : (
            <Button type="button" onClick={reactivate}>
              Reactivar
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => router.push('/clients')}>
            Volver al listado
          </Button>
        </div>
      ) : null}
    </div>
  );
}