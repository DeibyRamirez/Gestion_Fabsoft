'use client';

import { useState, type FormEvent } from 'react';
import { ClientCreateSchema, type ClientCreateInput, type ClientDto } from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

const selectClassName =
  'flex h-10 w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg shadow-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

type Props = {
  token: string | null;
  onCreated?: (client: ClientDto) => void;
};

export function ClientForm({ token, onCreated }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const parsed = ClientCreateSchema.safeParse({
      legalName: String(data.get('legalName') ?? ''),
      taxId: String(data.get('taxId') ?? '').trim() || null,
      email: String(data.get('email') ?? '').trim() || null,
      phone: String(data.get('phone') ?? '').trim() || null,
      status: String(data.get('status') ?? 'active') as ClientCreateInput['status'],
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setPending(true);
    try {
      const created = await apiFetch<ClientDto>('/clients', {
        method: 'POST',
        token,
        body: JSON.stringify(parsed.data),
      });
      onCreated?.(created);
      form.reset();
      setMessage('Cliente creado.');
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.problem?.code === 'client_tax_id_taken'
          ? 'Ya existe un cliente con ese NIT.'
          : 'No se pudo crear el cliente.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      {message ? (
        <p role="status" className="md:col-span-2 text-sm text-fg">
          {message}
        </p>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="legalName">Razón social</Label>
        <Input id="legalName" name="legalName" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="taxId">NIT / identificación</Label>
        <Input id="taxId" name="taxId" placeholder="900.123.456-7" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">Teléfono</Label>
        <Input id="phone" name="phone" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="status">Estado inicial</Label>
        <select id="status" name="status" defaultValue="active" className={selectClassName}>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </select>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending}>
          Crear cliente
        </Button>
      </div>
    </form>
  );
}
