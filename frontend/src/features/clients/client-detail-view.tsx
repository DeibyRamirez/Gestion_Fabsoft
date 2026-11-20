'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArchiveIcon, RotateCcwIcon } from 'lucide-react';
import { ClientArchiveSchema, ClientUpdateSchema, type ClientDto } from '@fabsoft/shared';
import { ApiError, apiFetch } from '@/shared/api/client';
import { useAuth } from '@/features/auth/auth-provider';
import { PromptDialog, minChars } from '@/shared/components/action-dialog';
import { BentoCard } from '@/shared/components/bento';
import { CopyButton } from '@/shared/components/copy-button';
import { DetailHero } from '@/shared/components/detail-hero';
import { FormField } from '@/shared/components/form-field';
import { FormGrid } from '@/shared/components/form-layout';
import { LoadingState } from '@/shared/components/loading-state';
import { SectionHeader } from '@/shared/components/section-header';
import { initialsFromName } from '@/shared/components/user-avatar';
import { formatYear } from '@/shared/lib/format';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { nativeSelectClassName } from '@/shared/ui/native-select';
import { StatusBadge } from '@/shared/ui/status-badge';
import { useToast } from '@/shared/ui/toast';
import { ActivityPanel } from './activity-panel';
import { ContactsPanel } from './contacts-panel';

export function ClientDetailView({
  clientId,
  created = false,
}: {
  clientId: string;
  created?: boolean;
}) {
  const { token, user } = useAuth();
  const router = useRouter();
  const [client, setClient] = useState<ClientDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const toast = useToast();
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
      toast('Cambios guardados.');
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Error al guardar';
      setMessage(errorMessage);
      toast(errorMessage, 'error');
    }
  }

  async function archive(reason: string) {
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
      toast('Cliente archivado.');
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'No se pudo archivar';
      setMessage(errorMessage);
      toast(errorMessage, 'error');
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
      toast('Cliente reactivado.');
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'No se pudo reactivar';
      setMessage(errorMessage);
      toast(errorMessage, 'error');
    }
  }

  if (!client) {
    return message ? (
      <Alert variant="destructive">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    ) : (
      <LoadingState label="Cargando cliente…" />
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <DetailHero
        title={client.legalName}
        accent={`cliente desde ${formatYear(client.createdAt)}`}
        initials={initialsFromName(client.legalName)}
        badge={<StatusBadge kind="client" value={client.status} />}
        meta={
          <>
            NIT <span className="font-mono">{client.taxId ?? '—'}</span>
          </>
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="border-white/25 bg-white/10 text-white hover:bg-white/20"
              onClick={() => router.push('/clients')}
            >
              Volver al listado
            </Button>
            {isAdmin && client.status !== 'archivado' ? (
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-white text-status-expired-fg hover:bg-white/90"
                onClick={() => setArchiveOpen(true)}
              >
                <ArchiveIcon aria-hidden />
                Archivar
              </Button>
            ) : null}
            {isAdmin && client.status === 'archivado' ? (
              <Button
                type="button"
                variant="outline"
                className="border-white/20 bg-white text-status-active-fg hover:bg-white/90"
                onClick={() => void reactivate()}
              >
                <RotateCcwIcon aria-hidden />
                Reactivar
              </Button>
            ) : null}
          </>
        }
      />

      <p role="status" className="sr-only">
        {message}
      </p>

      {created ? (
        <Alert variant="success" className="flex flex-wrap items-center gap-2">
          <AlertDescription className="font-semibold">Cliente creado.</AlertDescription>
          <span className="text-xs">ID cliente:</span>
          <code className="min-w-0 flex-1 break-all font-mono text-xs">{client.id}</code>
          <CopyButton value={client.id} label="Copiar ID" />
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <BentoCard className="self-start lg:col-span-5">
          <SectionHeader
            title="Datos"
            action={<span className="text-xs text-fg-muted">Editable</span>}
          />
          <form onSubmit={save} className="mt-4">
            <FormGrid>
              <FormField
                label="Razón social"
                htmlFor="legalName"
                className="md:col-span-2"
                required
              >
                <Input id="legalName" name="legalName" defaultValue={client.legalName} required />
              </FormField>
              <FormField
                label="ID cliente"
                htmlFor="clientId"
                className="md:col-span-2"
                hint="Identificador interno para vincular usuarios con rol cliente."
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="clientId"
                    value={client.id}
                    readOnly
                    className="min-w-0 flex-1 font-mono text-xs"
                  />
                  <CopyButton value={client.id} />
                </div>
              </FormField>
              <FormField label="NIT" htmlFor="taxId">
                <Input
                  id="taxId"
                  name="taxId"
                  defaultValue={client.taxId ?? ''}
                  className="font-mono"
                />
              </FormField>
              <FormField label="Estado" htmlFor="status">
                <select
                  id="status"
                  name="status"
                  defaultValue={client.status === 'archivado' ? 'inactivo' : client.status}
                  disabled={client.status === 'archivado'}
                  className={nativeSelectClassName}
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </FormField>
              <FormField label="Email" htmlFor="email" className="md:col-span-2">
                <Input id="email" name="email" type="email" defaultValue={client.email ?? ''} />
              </FormField>
              <FormField label="Teléfono" htmlFor="phone" className="md:col-span-2">
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={client.phone ?? ''}
                  className="font-mono"
                />
              </FormField>
            </FormGrid>
            <div className="mt-5 flex justify-end">
              <Button
                type="submit"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={client.status === 'archivado'}
              >
                Guardar
              </Button>
            </div>
          </form>
        </BentoCard>

        <div className="flex flex-col gap-4 lg:col-span-7">
          <ContactsPanel
            clientId={clientId}
            token={token}
            readOnly={client.status === 'archivado'}
          />
          <ActivityPanel clientId={clientId} token={token} />
        </div>
      </div>

      <PromptDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archivar cliente"
        description="El cliente quedará en solo lectura. Un administrador puede reactivarlo."
        submitLabel="Archivar"
        destructive
        fields={[
          {
            name: 'reason',
            label: 'Motivo para archivar (mín. 3 caracteres)',
            type: 'textarea',
            validate: minChars(3),
          },
        ]}
        onSubmit={(v) => void archive(v.reason ?? '')}
      />
    </div>
  );
}
